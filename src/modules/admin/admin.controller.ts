import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Audit } from '@/common/decorators/audit.decorator';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AdminStatsService } from './admin-stats.service';
import { AdminSystemService } from './admin-system.service';
import { AdminUsersService } from './admin-users.service';
import {
  ChartQueryDto, ListActivitiesQueryDto, ListAuditQueryDto, ListUsersQueryDto, ListVerificationsQueryDto, ProcessVerificationDto, RegisterAdminDto, ReviewDocumentDto, SetUserStatusDto,
} from './dto/admin.dto';

const uuid = () => new ParseUUIDPipe();

/** Tudo exige admin. As acções que alteram dados ou abrem documentos privados ficam no AuditLog. */
@Roles(UserRole.admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly stats: AdminStatsService, private readonly users: AdminUsersService, private readonly system: AdminSystemService) {}

  @Get('stats') getStats() { return this.stats.stats(); }
  @Get('stats/chart') chart(@Query() q: ChartQueryDto) { return this.stats.chart(q); }
  @Get('pending-verifications') pending() { return this.stats.pendingVerifications(); }

  @Get('system-status') status() { return this.system.status(); }
  @Get('system-metrics') metrics() { return this.system.metrics(); }

  @Get('activities') activities(@Query() q: ListActivitiesQueryDto) { return this.stats.activities(q); }
  @Get('activities/:id') activity(@Param('id', uuid()) id: string) { return this.stats.activity(id); }
  @Get('audit-logs') audit(@Query() q: ListAuditQueryDto) { return this.stats.auditLogs(q); }

  @Audit('admin.register', 'user') @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('register')
  register(@Body() dto: RegisterAdminDto) { return this.users.registerAdmin(dto); }

  @Get('users') listUsers(@Query() q: ListUsersQueryDto) { return this.users.listUsers(q); }
  @Get('users/:id') user(@Param('id', uuid()) id: string) { return this.users.getUser(id); }
  @Audit('user.set-status', 'user') @Patch('users/:id/status')
  setStatus(@CurrentUser() a: AuthUser, @Param('id', uuid()) id: string, @Body() dto: SetUserStatusDto) { return this.users.setStatus(a, id, dto); }

  @Get('verifications') verifications(@Query() q: ListVerificationsQueryDto) { return this.users.listVerifications(q); }
  @Get('verifications/:id') verification(@Param('id', uuid()) id: string) { return this.users.verificationDetails(id); }
  @Audit('verification.process', 'user') @Patch('verifications/:id')
  process(@CurrentUser() a: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ProcessVerificationDto) { return this.users.processVerification(a, id, dto); }

  @Audit('document.review', 'document') @Patch('documents/:id/review')
  review(@CurrentUser() a: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ReviewDocumentDto) { return this.users.reviewDocument(a, id, dto); }
  @Audit('document.download', 'document') @Get('documents/:id/download')
  download(@Param('id', uuid()) id: string) { return this.users.downloadDocument(id); }
}
