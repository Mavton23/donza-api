import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Audit } from '@/common/decorators/audit.decorator';
import { CurrentUser, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AdminListPayoutsQueryDto, DestinationDto, KycDecisionDto, KycSubmitDto, ListKycQueryDto, ListPayoutsQueryDto, MarkFailedDto, MarkPaidDto, RunPayoutsDto } from './dto/payments.dto';
import { PayoutsService } from './payouts.service';

const uuid = () => new ParseUUIDPipe();
const BEN = [UserRole.instructor, UserRole.institution];

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly svc: PayoutsService) {}

  @Roles(...BEN) @Get('me') mine(@CurrentUser() u: AuthUser, @Query() q: ListPayoutsQueryDto) { return this.svc.mine(u, q); }
  @Roles(...BEN) @Get('payout-methods') destination(@CurrentUser() u: AuthUser) { return this.svc.getDestination(u); }
  @Roles(...BEN) @RequireApproved() @Put('payout-methods') setDestination(@CurrentUser() u: AuthUser, @Body() dto: DestinationDto) { return this.svc.setDestination(u, dto); }
  @Roles(...BEN) @RequireApproved() @HttpCode(200) @Post('kyc') kyc(@CurrentUser() u: AuthUser, @Body() dto: KycSubmitDto) { return this.svc.submitKyc(u, dto); }

  @Roles(UserRole.admin) @Get('admin') adminList(@Query() q: AdminListPayoutsQueryDto) { return this.svc.adminList(q); }
  @Roles(UserRole.admin) @Get('admin/kyc') listKyc(@Query() q: ListKycQueryDto) { return this.svc.listKyc(q); }
  @Roles(UserRole.admin) @Audit('kyc.decide', 'user') @Patch('admin/kyc/:userId') decideKyc(@Param('userId', uuid()) id: string, @Body() dto: KycDecisionDto) { return this.svc.decideKyc(id, dto); }
  @Roles(UserRole.admin) @Audit('payout.run', 'payout') @HttpCode(200) @Post('admin/run') run(@Body() dto: RunPayoutsDto) { return this.svc.run(dto); }
  @Roles(UserRole.admin) @Audit('payout.mark-paid', 'payout') @HttpCode(200) @Post('admin/:payoutId/mark-paid') paid(@Param('payoutId', uuid()) id: string, @Body() dto: MarkPaidDto) { return this.svc.markPaid(id, dto); }
  @Roles(UserRole.admin) @Audit('payout.mark-failed', 'payout') @HttpCode(200) @Post('admin/:payoutId/mark-failed') failed(@Param('payoutId', uuid()) id: string, @Body() dto: MarkFailedDto) { return this.svc.markFailed(id, dto); }
  @Roles(UserRole.admin) @Audit('payout.retry', 'payout') @HttpCode(200) @Post('admin/:payoutId/retry') retry(@Param('payoutId', uuid()) id: string) { return this.svc.retry(id); }
}
