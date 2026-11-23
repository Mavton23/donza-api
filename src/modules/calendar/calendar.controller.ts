import { Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Public } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CalendarService } from './calendar.service';

class RangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

const ICS = 'text/calendar; charset=utf-8';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  @Get('items') items(@CurrentUser() u: AuthUser, @Query() q: RangeQueryDto) { return this.svc.list(u, q.from, q.to); }

  @Get('export.ics')
  async export(@CurrentUser() u: AuthUser, @Query() q: RangeQueryDto, @Res() res: Response) {
    res.set({ 'Content-Type': ICS, 'Content-Disposition': 'attachment; filename="donza.ics"', 'Cache-Control': 'private, no-store' }).send(await this.svc.exportIcs(u, q.from, q.to));
  }

  @Get('feed-token') token(@CurrentUser() u: AuthUser) { return this.svc.feedToken(u); }
  @HttpCode(200) @Post('feed-token/rotate') rotate(@CurrentUser() u: AuthUser) { return this.svc.feedToken(u, true); }

  /** Subscrição por URL (sem sessão): o segredo está no próprio link. */
  @Public() @Header('Content-Type', ICS) @Header('Cache-Control', 'private, no-store') @Get('feed/:token')
  feed(@Param('token') token: string) { return this.svc.feed(token); }

  @Public() @Get('events/:eventId/ics')
  async event(@Param('eventId', ParseUUIDPipe) id: string, @Res() res: Response) {
    res.set({ 'Content-Type': ICS, 'Content-Disposition': 'attachment; filename="evento.ics"' }).send(await this.svc.eventIcs(id));
  }
}
