import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { Audit } from '@/common/decorators/audit.decorator';
import { CurrentUser, Public, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AdminListPaymentsQueryDto, ConfirmPaymentDto, FinancialReportQueryDto, ListPaymentsQueryDto, ProcessPaymentDto, RefundDto, SaveMethodDto } from './dto/payments.dto';
import { FinancialReportService } from './financial-report.service';
import { PaymentsService } from './payments.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (providers, methods, history, admin, reports, webhook) antes de `:paymentId`. */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService, private readonly reports: FinancialReportService) {}

  @Get('providers') providers() { return this.svc.providersList(); }

  @Get('methods') methods(@CurrentUser() u: AuthUser) { return this.svc.listMethods(u); }
  @RequireApproved() @Post('methods') saveMethod(@CurrentUser() u: AuthUser, @Body() dto: SaveMethodDto) { return this.svc.saveMethod(u, dto); }
  @Patch('methods/:methodId/default') setDefault(@CurrentUser() u: AuthUser, @Param('methodId', uuid()) id: string) { return this.svc.setDefaultMethod(u, id); }
  @Delete('methods/:methodId') removeMethod(@CurrentUser() u: AuthUser, @Param('methodId', uuid()) id: string) { return this.svc.removeMethod(u, id); }

  @RequireApproved() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('process')
  process(@CurrentUser() u: AuthUser, @Body() dto: ProcessPaymentDto, @Headers('idempotency-key') key?: string) { return this.svc.process(u, dto, key); }

  @Get('history') history(@CurrentUser() u: AuthUser, @Query() q: ListPaymentsQueryDto) { return this.svc.history(u, q); }

  /** Webhook do fornecedor: sem sessão; autenticado pela assinatura sobre o corpo cru. */
  @Public() @SkipThrottle() @HttpCode(200) @Post('webhook/:provider')
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) { return this.svc.handleWebhook(provider, req.rawBody, req.headers); }

  @Roles(UserRole.admin) @Get('admin') adminList(@Query() q: AdminListPaymentsQueryDto) { return this.svc.adminList(q); }
  @Roles(UserRole.admin) @Get('reports/financial') report(@Query() q: FinancialReportQueryDto) { return this.reports.report(q.period); }
  @Roles(UserRole.admin) @Audit('payment.confirm', 'payment') @HttpCode(200) @Post(':paymentId/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('paymentId', uuid()) id: string, @Body() dto: ConfirmPaymentDto) { return this.svc.confirm(u, id, dto); }
  @Roles(UserRole.admin) @Audit('payment.refund', 'payment') @HttpCode(200) @Post(':paymentId/refund')
  refund(@CurrentUser() u: AuthUser, @Param('paymentId', uuid()) id: string, @Body() dto: RefundDto) { return this.svc.refund(u, id, dto); }

  @Get(':paymentId') detail(@CurrentUser() u: AuthUser, @Param('paymentId', uuid()) id: string) { return this.svc.detail(u, id); }
  @HttpCode(200) @Post(':paymentId/cancel') cancel(@CurrentUser() u: AuthUser, @Param('paymentId', uuid()) id: string) { return this.svc.cancel(u, id); }
  @HttpCode(200) @Post(':paymentId/fulfill') fulfill(@CurrentUser() u: AuthUser, @Param('paymentId', uuid()) id: string) { return this.svc.retryFulfill(u, id); }
}
