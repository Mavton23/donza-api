import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Audit } from '@/common/decorators/audit.decorator';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { BillingService } from './billing.service';
import { UpdateBillingDto } from './dto/payments.dto';

class BillingQueryDto extends PaginationQueryDto { @IsOptional() @IsUUID() institutionId?: string }

@Controller('billing')
export class BillingController {
  constructor(private readonly svc: BillingService) {}
  @Roles(UserRole.institution, UserRole.admin) @Get() current(@CurrentUser() u: AuthUser, @Query() q: BillingQueryDto) { return this.svc.current(u, q.institutionId); }
  @Roles(UserRole.institution, UserRole.admin) @Get('invoices') invoices(@CurrentUser() u: AuthUser, @Query() q: BillingQueryDto) { return this.svc.invoices(u, q, q.institutionId); }
  @Roles(UserRole.admin) @Audit('billing.update', 'billing') @Patch(':institutionId') update(@Param('institutionId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBillingDto) { return this.svc.adminUpdate(id, dto); }
}
