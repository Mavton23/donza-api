import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CreateAppealDto, DecideAppealDto, ListActionsQueryDto, ListAppealsQueryDto, ListScansQueryDto, MuteDto, ReasonedActionDto, ReverseDto, ReviewScanDto, ScanDto } from './moderation.dto';
import { ModerationService } from './moderation.service';

const uuid = () => new ParseUUIDPipe();

@Controller('study-groups/:groupId/moderation')
export class ModerationController {
  constructor(private readonly svc: ModerationService) {}

  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string) { return this.svc.dashboard(u, g); }
  @Get('actions') actions(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListActionsQueryDto) { return this.svc.actions(u, g, q); }
  @Get('mine') mine(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string) { return this.svc.mine(u, g); }

  @RequireApproved() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post('warn')
  warn(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: ReasonedActionDto) { return this.svc.warn(u, g, dto); }
  @RequireApproved() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post('mute') @HttpCode(200)
  mute(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: MuteDto) { return this.svc.mute(u, g, dto); }
  @RequireApproved() @Post('unmute') @HttpCode(200)
  unmute(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: ReverseDto) { return this.svc.unmute(u, g, dto); }
  @RequireApproved() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post('ban') @HttpCode(200)
  ban(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: ReasonedActionDto) { return this.svc.ban(u, g, dto); }
  @RequireApproved() @Post('unban') @HttpCode(200)
  unban(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: ReverseDto) { return this.svc.unban(u, g, dto); }

  @RequireApproved() @Throttle({ default: { limit: 6, ttl: 60_000 } }) @Post('scan') @HttpCode(200)
  scan(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: ScanDto) { return this.svc.scan(u, g, dto); }
  @Get('scans') scans(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListScansQueryDto) { return this.svc.scans(u, g, q); }
  @RequireApproved() @Patch('scans/:scanId')
  review(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('scanId', uuid()) s: string, @Body() dto: ReviewScanDto) { return this.svc.reviewScan(u, g, s, dto); }

  /** Recurso: o membro sancionado recorre de uma medida em vigor. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('appeals')
  appeal(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: CreateAppealDto) { return this.svc.appeal(u, g, dto); }
  @Get('appeals') appeals(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListAppealsQueryDto) { return this.svc.appeals(u, g, q); }
  @RequireApproved() @Patch('appeals/:appealId')
  decide(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('appealId', uuid()) a: string, @Body() dto: DecideAppealDto) { return this.svc.decideAppeal(u, g, a, dto); }
}
