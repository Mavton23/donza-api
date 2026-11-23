import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CourseContentService } from './course-content.service';
import {
  BatchLessonsDto,
  CreateLessonDto,
  CreateModuleDto,
  ReorderDto,
  SignUploadDto,
  UpdateLessonDto,
  UpdateModuleDto,
} from './dto/content.dto';

/** Gestão de conteúdo. A propriedade do curso é verificada no service (instrutor, organizador ou admin). */
@Roles(UserRole.instructor, UserRole.institution, UserRole.admin)
@RequireApproved()
@Controller('courses/:courseId')
export class CourseContentController {
  constructor(private readonly content: CourseContentService) {}

  /** Passo 1 do upload de vídeo/áudio/PDF: pede a assinatura; o browser envia directo ao Cloudinary. */
  @Post('media/signature')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  sign(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: SignUploadDto) {
    return this.content.signUpload(user, courseId, dto);
  }

  @Post('modules')
  createModule(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: CreateModuleDto) {
    return this.content.createModule(user, courseId, dto);
  }

  @Put('modules/reorder')
  reorderModules(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: ReorderDto) {
    return this.content.reorderModules(user, courseId, dto.ids);
  }

  @Patch('modules/:moduleId')
  updateModule(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.content.updateModule(user, courseId, moduleId, dto);
  }

  @Delete('modules/:moduleId')
  deleteModule(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ) {
    return this.content.deleteModule(user, courseId, moduleId);
  }

  @Post('modules/:moduleId/lessons')
  createLesson(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.content.createLesson(user, courseId, moduleId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('modules/:moduleId/lessons/batch')
  createLessonsBatch(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: BatchLessonsDto,
  ) {
    return this.content.createLessonsBatch(user, courseId, moduleId, dto);
  }

  @Put('modules/:moduleId/lessons/reorder')
  reorderLessons(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.content.reorderLessons(user, courseId, moduleId, dto.ids);
  }

  @Patch('modules/:moduleId/lessons/:lessonId')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.content.updateLesson(user, courseId, moduleId, lessonId, dto);
  }

  @Delete('modules/:moduleId/lessons/:lessonId')
  deleteLesson(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.content.deleteLesson(user, courseId, moduleId, lessonId);
  }
}
