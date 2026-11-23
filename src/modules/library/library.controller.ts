import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { BatchLessonsDto, CreateLessonDto, ReorderDto, UpdateLessonDto } from '../courses/dto/content.dto';
import { AttachModuleDto, CreateLibraryModuleDto, LibraryLessonsQueryDto, LibrarySignDto, UpdateLibraryModuleDto } from './dto/library.dto';
import { LibraryService } from './library.service';

const uuid = () => new ParseUUIDPipe();
const AUTHORS = [UserRole.instructor, UserRole.institution, UserRole.admin] as const;

/** Rotas estáticas (`media`, `modules`, `lessons` públicas) antes das paramétricas. */
@Controller('library')
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  // público
  @OptionalAuth() @Get('lessons') catalog(@Query() q: LibraryLessonsQueryDto) { return this.svc.catalog(q); }
  @OptionalAuth() @Get('lessons/:lessonId') lesson(@CurrentUser() u: AuthUser | undefined, @Param('lessonId', uuid()) id: string) { return this.svc.lesson(u, id); }
  @HttpCode(200) @Post('lessons/:lessonId/complete') complete(@CurrentUser() u: AuthUser, @Param('lessonId', uuid()) id: string) { return this.svc.setCompleted(u, id, true); }
  @Delete('lessons/:lessonId/complete') uncomplete(@CurrentUser() u: AuthUser, @Param('lessonId', uuid()) id: string) { return this.svc.setCompleted(u, id, false); }

  // autores
  @Roles(...AUTHORS) @RequireApproved() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post('media/signature')
  sign(@CurrentUser() u: AuthUser, @Body() dto: LibrarySignDto) { return this.svc.sign(u, dto); }

  @Roles(...AUTHORS) @RequireApproved() @Post('modules') createModule(@CurrentUser() u: AuthUser, @Body() dto: CreateLibraryModuleDto) { return this.svc.createModule(u, dto); }
  @Roles(...AUTHORS) @Get('modules') modules(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) { return this.svc.listModules(u, q); }
  @Roles(...AUTHORS) @Get('modules/:moduleId') module(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string) { return this.svc.getModule(u, id); }
  @Roles(...AUTHORS) @RequireApproved() @Patch('modules/:moduleId') updateModule(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string, @Body() dto: UpdateLibraryModuleDto) { return this.svc.updateModule(u, id, dto); }
  @Roles(...AUTHORS) @RequireApproved() @Delete('modules/:moduleId') deleteModule(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string) { return this.svc.deleteModule(u, id); }

  @Roles(...AUTHORS) @RequireApproved() @Post('modules/:moduleId/lessons')
  createLesson(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string, @Body() dto: CreateLessonDto) { return this.svc.createLesson(u, id, dto); }
  @Roles(...AUTHORS) @RequireApproved() @Throttle({ default: { limit: 20, ttl: 60_000 } }) @Post('modules/:moduleId/lessons/batch')
  batch(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string, @Body() dto: BatchLessonsDto) { return this.svc.createLessonsBatch(u, id, dto); }
  @Roles(...AUTHORS) @RequireApproved() @Put('modules/:moduleId/lessons/reorder')
  reorder(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string, @Body() dto: ReorderDto) { return this.svc.reorderLessons(u, id, dto.ids); }
  @Roles(...AUTHORS) @RequireApproved() @Patch('modules/:moduleId/lessons/:lessonId')
  updateLesson(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) m: string, @Param('lessonId', uuid()) l: string, @Body() dto: UpdateLessonDto) { return this.svc.updateLesson(u, m, l, dto); }
  @Roles(...AUTHORS) @RequireApproved() @Delete('modules/:moduleId/lessons/:lessonId')
  deleteLesson(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) m: string, @Param('lessonId', uuid()) l: string) { return this.svc.deleteLesson(u, m, l); }

  @Roles(...AUTHORS) @RequireApproved() @HttpCode(200) @Post('modules/:moduleId/attach')
  attach(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string, @Body() dto: AttachModuleDto) { return this.svc.attach(u, id, dto); }
  @Roles(...AUTHORS) @RequireApproved() @HttpCode(200) @Post('modules/:moduleId/detach')
  detach(@CurrentUser() u: AuthUser, @Param('moduleId', uuid()) id: string) { return this.svc.detach(u, id); }
}
