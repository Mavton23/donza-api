import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { DashboardService } from './dashboard.service';
import { DashboardAnalyticsQueryDto } from './dto/dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.me(u); }
  @Roles(UserRole.student) @Get('student') student(@CurrentUser() u: AuthUser) { return this.svc.student(u.userId); }
  @Roles(UserRole.instructor, UserRole.institution) @Get('instructor') instructor(@CurrentUser() u: AuthUser) { return this.svc.instructor(u.userId, u.role); }
  @Roles(UserRole.instructor, UserRole.institution) @Get('instructor/analytics')
  analytics(@CurrentUser() u: AuthUser, @Query() q: DashboardAnalyticsQueryDto) { return this.svc.instructorAnalytics(u, q.period); }
  @Roles(UserRole.instructor, UserRole.institution, UserRole.admin) @Get('instructors/:instructorId/metrics')
  instructorMetrics(@CurrentUser() u: AuthUser, @Param('instructorId', ParseUUIDPipe) id: string) { return this.svc.instructorMetrics(u, id); }
  @Roles(UserRole.instructor, UserRole.institution, UserRole.admin) @Get('courses/:courseId/metrics')
  courseMetrics(@CurrentUser() u: AuthUser, @Param('courseId', ParseUUIDPipe) id: string) { return this.svc.courseMetrics(u, id); }
}
