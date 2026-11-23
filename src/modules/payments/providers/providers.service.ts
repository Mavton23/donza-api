import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BankTransferProvider } from './bank-transfer.provider';
import { SimulatedMobileMoneyProvider } from './mobile-money.provider';
import { PaymentProviderAdapter } from './provider.interface';
import { StripeProvider } from './stripe.provider';

/** Registo dos fornecedores. Acrescentar um novo = criar o adaptador e registá-lo aqui. */
@Injectable()
export class PaymentProvidersService {
  private readonly all: Map<string, PaymentProviderAdapter>;
  constructor(config: ConfigService, stripe: StripeProvider, bank: BankTransferProvider) {
    const list: PaymentProviderAdapter[] = [
      stripe,
      new SimulatedMobileMoneyProvider('mpesa', 'M-Pesa', ['84', '85'], config),
      new SimulatedMobileMoneyProvider('emola', 'e-Mola', ['86', '87'], config),
      bank,
    ];
    this.all = new Map(list.map((p) => [p.id, p]));
  }
  get(id: string) { return this.all.get(id); }
  list() { return [...this.all.values()]; }
  enabled() { return this.list().filter((p) => p.isConfigured()); }
}
