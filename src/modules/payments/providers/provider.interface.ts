import { PaymentMethod } from '@prisma/client';

export interface ChargeInput {
  paymentId: string;
  /** Decimal em texto, ex.: "1500.00" */
  amount: string;
  currency: string;
  description: string;
  customer: { userId: string; email: string };
  phone?: string;
  returnUrl: string;
  cancelUrl: string;
  /** Identificador do método guardado no fornecedor (cartão tokenizado). */
  methodToken?: string;
}

export interface ChargeResult {
  externalId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  checkoutUrl?: string;
  instructions?: Record<string, unknown>;
  failureCode?: string;
  failureMessage?: string;
}

export interface WebhookEvent {
  /** Identificador único do evento no fornecedor (idempotência). */
  eventId: string;
  kind: 'payment' | 'payout';
  externalId: string;
  status: 'succeeded' | 'failed' | 'canceled' | 'processing' | 'paid';
  /** Montante em unidades menores (ex.: cêntimos) quando o fornecedor o envia: confere-se com o pedido. */
  amountMinor?: number;
  currency?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface PayoutDestination {
  type: 'mobile_money' | 'bank_transfer';
  provider?: string;
  number?: string;
  bankName?: string;
  account?: string;
}

export interface PayoutInput { payoutId: string; amount: string; currency: string; destination: PayoutDestination }
export interface PayoutResult { externalId: string; status: 'processing' | 'paid' | 'failed'; failureCode?: string; failureMessage?: string }

export interface PaymentProviderAdapter {
  readonly id: string;
  readonly name: string;
  /** Tipos de método suportados (para listar e filtrar). */
  readonly methods: PaymentMethod[];
  /** Moedas aceites; `*` = qualquer. */
  readonly currencies: string[] | '*';
  readonly requiresPhone: boolean;
  /** Se a confirmação é feita por um administrador em vez de um webhook. */
  readonly manualConfirmation: boolean;
  isConfigured(): boolean;
  validatePhone?(phone: string): string; // devolve o número normalizado ou lança
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Verifica a assinatura sobre o corpo cru e devolve o evento. Lança `UnauthorizedException` se for inválida. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent | null;
  refund(args: { externalId: string; amount: string; currency: string; idempotencyKey: string }): Promise<{ externalRefundId: string }>;
  /** Transferência para o beneficiário (só fornecedores que o suportem). */
  payout?(input: PayoutInput): Promise<PayoutResult>;
}

export const toMinor = (amount: string | number) => Math.round(Number(amount) * 100);
