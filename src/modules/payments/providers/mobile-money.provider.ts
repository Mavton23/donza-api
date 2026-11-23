import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ChargeInput, ChargeResult, PaymentProviderAdapter, PayoutInput, PayoutResult, WebhookEvent } from './provider.interface';

/**
 * M-Pesa (Vodacom, 84/85) e e-Mola (Movitel, 86/87) — MODO SIMULADO.
 *
 * Os contratos reais das APIs destes operadores dependem de credenciais e documentação do parceiro, que não
 * tenho; por isso este adaptador só funciona com PAYMENTS_SIMULATED=true e **nunca em produção**.
 * Cria um pedido pendente e deixa o webhook (assinado com HMAC-SHA256 em `x-signature`, segredo
 * `<ID>_WEBHOOK_SECRET`) confirmar, tal como o operador faria. Para ligar o operador real, implementem-se
 * `charge`, `refund` e `payout` aqui; o resto do sistema não muda.
 */
export class SimulatedMobileMoneyProvider implements PaymentProviderAdapter {
  readonly methods = ['mobile_method', 'digital_wallet'] as PaymentProviderAdapter['methods'];
  readonly currencies = ['MZN'];
  readonly requiresPhone = true;
  readonly manualConfirmation = false;

  constructor(readonly id: 'mpesa' | 'emola', readonly name: string, private readonly prefixes: string[], private readonly config: ConfigService) {}

  private get secret() { return this.config.get<string>(`${this.id.toUpperCase()}_WEBHOOK_SECRET`); }
  isConfigured() { return this.config.get<string>('PAYMENTS_SIMULATED') === 'true' && this.config.get<string>('NODE_ENV') !== 'production' && !!this.secret; }

  validatePhone(phone: string) {
    const digits = phone.replace(/[\s()-]/g, '').replace(/^\+/, '');
    const national = digits.startsWith('258') ? digits.slice(3) : digits;
    if (!/^8\d{8}$/.test(national) || !this.prefixes.includes(national.slice(0, 2))) {
      throw new BadRequestException({ message: `Número inválido para ${this.name} (prefixos ${this.prefixes.join('/')})`, code: 'INVALID_PHONE' });
    }
    return `258${national}`;
  }

  async charge(i: ChargeInput): Promise<ChargeResult> {
    return {
      externalId: `sim_${this.id}_${randomBytes(8).toString('hex')}`, status: 'pending',
      instructions: { message: `Confirme o pagamento de ${i.amount} ${i.currency} no seu telemóvel (${i.phone}).`, simulated: true },
    };
  }

  verifyWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const secret = this.secret;
    const given = Buffer.from(String(headers['x-signature'] ?? ''), 'hex');
    if (!secret || !given.length) throw new UnauthorizedException('Assinatura em falta');
    const expected = createHmac('sha256', secret).update(raw).digest();
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('Assinatura inválida');
    const b = JSON.parse(raw.toString('utf8')) as Partial<WebhookEvent>;
    if (!b.eventId || !b.externalId || !b.status || (b.kind !== 'payment' && b.kind !== 'payout')) throw new BadRequestException('Evento inválido');
    return b as WebhookEvent;
  }

  async refund() { return { externalRefundId: `sim_refund_${randomBytes(6).toString('hex')}` }; }

  async payout(i: PayoutInput): Promise<PayoutResult> {
    // simulado: aceite pelo operador, concluído mais tarde por webhook
    void i;
    return { externalId: `sim_payout_${this.id}_${randomBytes(8).toString('hex')}`, status: 'processing' };
  }
}
