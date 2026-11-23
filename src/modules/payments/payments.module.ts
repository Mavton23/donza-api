import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { EventsModule } from '../events/events.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FinancialReportService } from './financial-report.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { BankTransferProvider } from './providers/bank-transfer.provider';
import { PaymentProvidersService } from './providers/providers.service';
import { StripeProvider } from './providers/stripe.provider';

@Module({
  imports: [CoursesModule, EventsModule],
  controllers: [PaymentsController, PayoutsController, BillingController],
  providers: [PaymentsService, PayoutsService, BillingService, FinancialReportService, PaymentProvidersService, StripeProvider, BankTransferProvider],
})
export class PaymentsModule {}
