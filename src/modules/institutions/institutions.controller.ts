import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { AnalyticsQueryDto, InstitutionCoursesQueryDto, LimitQueryDto, ListInstructorsQueryDto, ListInvitesQueryDto, ListMembersQueryDto, RespondInviteDto, SendInviteDto } from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`invites`) antes de `:userId`. */
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Roles(UserRole.institution) @RequireApproved() @Throttle({ default: { limit: 20, ttl: 60_000 } }) @Post('invites')
  invite(@CurrentUser() u: AuthUser, @Body() dto: SendInviteDto) { return this.svc.sendInvite(u, dto); }
  @Roles(UserRole.instructor) @HttpCode(200) @Post('invites/respond') respond(@CurrentUser() u: AuthUser, @Body() dto: RespondInviteDto) { return this.svc.respond(u, dto); }
  @Roles(UserRole.institution, UserRole.instructor) @Get('invites') invites(@CurrentUser() u: AuthUser, @Query() q: ListInvitesQueryDto) { return this.svc.listInvites(u, q); }
  @Delete('invites/:id') removeLink(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.removeLink(u, id); }

  @OptionalAuth() @Get(':userId/instructors')
  instructors(@CurrentUser() u: AuthUser | undefined, @Param('userId', uuid()) id: string, @Query() q: ListInstructorsQueryDto) { return this.svc.instructors(u, id, q); }
  @OptionalAuth() @Get(':userId/courses')
  courses(@CurrentUser() u: AuthUser | undefined, @Param('userId', uuid()) id: string, @Query() q: InstitutionCoursesQueryDto) { return this.svc.courses(u, id, q); }

  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/stats') stats(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.stats(u, id); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/recent-enrollments')
  recent(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: LimitQueryDto) { return this.svc.recentEnrollments(u, id, q.limit); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/top-courses')
  top(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: LimitQueryDto) { return this.svc.topCourses(u, id, q.limit); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/analytics')
  analytics(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: AnalyticsQueryDto) { return this.svc.analytics(u, id, q); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/members')
  members(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: ListMembersQueryDto) { return this.svc.members(u, id, q); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/settings') settings(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.settings(u, id); }
  @Roles(UserRole.institution, UserRole.admin) @Get(':userId/certificates')
  certificates(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: PaginationQueryDto) { return this.svc.certificates(u, id, q); }
}
