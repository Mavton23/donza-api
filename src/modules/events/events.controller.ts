import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, Public, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { AttendanceDto, CreateEventDto, ListEventsQueryDto, MyEventsQueryDto, UpdateEventDto } from './dto/event.dto';
import { EventsService } from './events.service';

const ORGANIZERS = [UserRole.instructor, UserRole.institution, UserRole.admin] as const;

/** Rotas estáticas (`me/...`, `admin/all`) antes de `:eventId`. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public() @Get()
  list(@Query() q: ListEventsQueryDto) {
    return this.events.listPublic(q);
  }

  @Roles(UserRole.admin) @Get('admin/all')
  adminList(@Query() q: ListEventsQueryDto) {
    return this.events.listAdmin(q);
  }

  @Get('me/registrations')
  myRegistrations(@CurrentUser('userId') userId: string, @Query() q: MyEventsQueryDto) {
    return this.events.myRegistrations(userId, q);
  }

  @Roles(...ORGANIZERS) @Get('me/organized')
  organized(@CurrentUser('userId') userId: string, @Query() q: ListEventsQueryDto) {
    return this.events.organized(userId, q);
  }

  @RequireApproved() @Roles(...ORGANIZERS) @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @OptionalAuth() @Get(':eventId')
  detail(@CurrentUser() user: AuthUser | undefined, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.getDetail(eventId, user);
  }

  @Patch(':eventId')
  update(@CurrentUser() user: AuthUser, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, eventId, dto);
  }

  @Delete(':eventId')
  remove(@CurrentUser() user: AuthUser, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.remove(user, eventId);
  }

  @RequireApproved() @Post(':eventId/register') @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  register(@CurrentUser('userId') userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.register(userId, eventId);
  }

  @Delete(':eventId/register')
  cancel(@CurrentUser('userId') userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.cancelRegistration(userId, eventId);
  }

  @Get(':eventId/registration/me')
  myRegistration(@CurrentUser('userId') userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.myRegistration(userId, eventId);
  }

  @Get(':eventId/participants')
  participants(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.events.participants(user, eventId, q);
  }

  @Patch(':eventId/participants/:userId/attendance')
  attendance(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.events.setAttendance(user, eventId, userId, dto.attended);
  }
}
