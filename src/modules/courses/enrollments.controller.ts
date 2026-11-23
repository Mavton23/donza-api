import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { UpdateEnrollmentDto } from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

/** Tudo aqui é do utilizador autenticado sobre a SUA matrícula (sem :userId, não há como mexer na de outros). */
@Controller('courses')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @RequireApproved() @Post(':courseId/enroll')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  enroll(@CurrentUser('userId') userId: string, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.enrollments.enroll(userId, courseId);
  }

  @Delete(':courseId/enroll')
  cancel(@CurrentUser('userId') userId: string, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.enrollments.cancel(userId, courseId);
  }

  @Get(':courseId/enrollment/me')
  mine(@CurrentUser('userId') userId: string, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.enrollments.myEnrollment(userId, courseId);
  }

  @Patch(':courseId/enrollment/me')
  updateMine(
    @CurrentUser('userId') userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.enrollments.updateMine(userId, courseId, dto);
  }

  /** Aceita UUID ou slug (a página de aprendizagem usa o slug). */
  @Get(':idOrSlug/progress')
  progress(@CurrentUser('userId') userId: string, @Param('idOrSlug') idOrSlug: string) {
    return this.enrollments.progress(userId, idOrSlug);
  }

  @Get(':courseId/completion-stats')
  stats(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.enrollments.completionStats(user, courseId);
  }

  @RequireApproved() @Post(':courseId/lessons/:lessonId/complete') @HttpCode(200)
  complete(
    @CurrentUser('userId') userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.enrollments.setLessonCompleted(userId, courseId, lessonId, true);
  }

  @Delete(':courseId/lessons/:lessonId/complete')
  uncomplete(
    @CurrentUser('userId') userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.enrollments.setLessonCompleted(userId, courseId, lessonId, false);
  }
}
