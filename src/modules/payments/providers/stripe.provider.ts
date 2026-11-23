import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChargeInput, ChargeResult, PaymentProviderAdapter, WebhookEvent, toMinor } from './provider.interface';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_SECONDS = 300;

/**
 * Stripe Checkout (pagamento alojado pela Stripe: nunca tocamos em dados de cartão).
 * Implementado sobre a API REST para não depender do SDK. Precisa de STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET.
 */
@Injectable()
export class StripeProvider implements PaymentProviderAdapter {
  readonly id = 'stripe';
  readonly name = 'Cartão (Stripe)';
  readonly methods = ['credit_card', 'debit_card', 'international'] as PaymentProviderAdapter['methods'];
  readonly currencies = '*' as const;
  readonly requiresPhone = false;
  readonly manualConfirmation = false;

  constructor(private readonly config: ConfigService) {}
  private get key() { return this.config.get<string>('STRIPE_SECRET_KEY'); }
  private get webhookSecret() { return this.config.get<string>('STRIPE_WEBHOOK_SECRET'); }
  isConfigured() { return !!this.key && !!this.webhookSecret; }

  private async call(method: 'GET' | 'POST', path: string, form?: URLSearchParams, idempotencyKey?: string) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.key}`,
        ...(form && { 'content-type': 'application/x-www-form-urlencoded' }),
        ...(idempotencyKey && { 'idempotency-key': idempotencyKey }),
      },
      body: form?.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) throw new BadGatewayException({ message: json.error?.message ?? 'Erro do fornecedor de pagamentos', code: 'PROVIDER_ERROR' });
    return json;
  }

  async charge(i: ChargeInput): Promise<ChargeResult> {
    const f = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': i.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(toMinor(i.amount)),
      'line_items[0][price_data][product_data][name]': i.description.slice(0, 120),
      client_reference_id: i.paymentId,
      customer_email: i.customer.email,
      'metadata[paymentId]': i.paymentId,
      success_url: i.returnUrl,
      cancel_url: i.cancelUrl,
    });
    const s = await this.call('POST', '/checkout/sessions', f, `charge-${i.paymentId}`);
    return { externalId: s.id, status: 'pending', checkoutUrl: s.url };
  }

  verifyWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const secret = this.webhookSecret;
    const header = String(headers['stripe-signature'] ?? '');
    if (!secret || !header) throw new UnauthorizedException('Assinatura em falta');
    const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) throw new UnauthorizedException('Assinatura expirada');
    const expected = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
    const given = Buffer.from(parts.v1 ?? '', 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('Assinatura inválida');

    const ev = JSON.parse(raw.toString('utf8')) as { id: string; type: string; data: { object: Record<string, any> } };
    const o = ev.data.object;
    const base = { eventId: ev.id, kind: 'payment' as const, externalId: o.id as string, amountMinor: o.amount_total as number | undefined, currency: (o.currency as string | undefined)?.toUpperCase() };
    switch (ev.type) {
      case 'checkout.session.completed': return { ...base, status: o.payment_status === 'paid' ? 'succeeded' : 'processing' };
      case 'checkout.session.async_payment_succeeded': return { ...base, status: 'succeeded' };
      case 'checkout.session.async_payment_failed': return { ...base, status: 'failed', failureCode: 'ASYNC_PAYMENT_FAILED' };
      case 'checkout.session.expired': return { ...base, status: 'canceled' };
      default: return null; // evento que não nos interessa
    }
  }

  async refund(a: { externalId: string; amount: string; currency: string; idempotencyKey: string }) {
    const session = await this.call('GET', `/checkout/sessions/${encodeURIComponent(a.externalId)}`);
    if (!session.payment_intent) throw new BadGatewayException({ message: 'Pagamento sem intenção de cobrança na Stripe', code: 'PROVIDER_ERROR' });
    const r = await this.call('POST', '/refunds', new URLSearchParams({ payment_intent: session.payment_intent, amount: String(toMinor(a.amount)) }), `refund-${a.idempotencyKey}`);
    return { externalRefundId: r.id as string };
  }
}
