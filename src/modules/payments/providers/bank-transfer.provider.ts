import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChargeInput, ChargeResult, PaymentProviderAdapter } from './provider.interface';

/** Transferência bancária: gera uma referência; um administrador confirma quando o dinheiro chega. */
@Injectable()
export class BankTransferProvider implements PaymentProviderAdapter {
  readonly id = 'bank_transfer';
  readonly name = 'Transferência bancária';
  readonly methods = ['bank_transfer'] as PaymentProviderAdapter['methods'];
  readonly currencies = '*' as const;
  readonly requiresPhone = false;
  readonly manualConfirmation = true;

  constructor(private readonly config: ConfigService) {}
  isConfigured() { return !!this.config.get<string>('BANK_TRANSFER_DETAILS'); }

  async charge(i: ChargeInput): Promise<ChargeResult> {
    const reference = `DNZ-${i.paymentId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    return {
      externalId: reference, status: 'pending',
      instructions: { reference, amount: i.amount, currency: i.currency, details: this.config.get<string>('BANK_TRANSFER_DETAILS'), message: 'Indique a referência na transferência. O acesso é libertado quando recebermos o valor.' },
    };
  }
  verifyWebhook(): never { throw new NotFoundException(); }
  async refund(a: { externalId: string }) { return { externalRefundId: `manual_${a.externalId}` }; } // devolução feita fora do sistema
}
