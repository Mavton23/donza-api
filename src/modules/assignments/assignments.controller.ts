import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { ALLOWED_MIME, MAX_FILE_SIZE } from '@/common/config/upload.config';
import { CurrentUser, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, GradeSubmissionDto, ListAssignmentsQueryDto, ListSubmissionsQueryDto, SubmitAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';

const uuid = () => new ParseUUIDPipe();
const MANAGERS = [UserRole.instructor, UserRole.institution, UserRole.admin] as const;

const attachment = () =>
  FileInterceptor('attachment', {
    limits: { fileSize: MAX_FILE_SIZE.DOCUMENT, files: 1 },
    fileFilter: (_req, f, cb) =>
      (ALLOWED_MIME.batchAttachment as readonly string[]).includes(f.mimetype) ? cb(null, true) : cb(new BadRequestException('Tipo de ficheiro não suportado'), false),
  });
const filePipe = new FileValidationPipe({ allowed: ALLOWED_MIME.batchAttachment, maxSize: MAX_FILE_SIZE.DOCUMENT });

/** Rotas estáticas (`managed`) antes das paramétricas. */
@Controller()
export class AssignmentsController {
  constructor(private readonly svc: AssignmentsService) {}

  // gestão
  @Roles(...MANAGERS) @Get('assignments/managed') managed(@CurrentUser() u: AuthUser, @Query() q: ListAssignmentsQueryDto) { return this.svc.managed(u, q); }
  @Roles(...MANAGERS) @RequireApproved() @Post('courses/:courseId/assignments')
  create(@CurrentUser() u: AuthUser, @Param('courseId', uuid()) id: string, @Body() dto: CreateAssignmentDto) { return this.svc.create(u, id, dto); }
  @Roles(...MANAGERS) @Get('courses/:courseId/assignments')
  list(@CurrentUser() u: AuthUser, @Param('courseId', uuid()) id: string, @Query() q: ListAssignmentsQueryDto) { return this.svc.listForCourse(u, id, q); }
  @Roles(...MANAGERS) @Patch('assignments/:assignmentId')
  update(@CurrentUser() u: AuthUser, @Param('assignmentId', uuid()) id: string, @Body() dto: UpdateAssignmentDto) { return this.svc.update(u, id, dto); }
  @Roles(...MANAGERS) @Delete('assignments/:assignmentId') remove(@CurrentUser() u: AuthUser, @Param('assignmentId', uuid()) id: string) { return this.svc.remove(u, id); }
  @Roles(...MANAGERS) @Get('assignments/:assignmentId/submissions')
  submissions(@CurrentUser() u: AuthUser, @Param('assignmentId', uuid()) id: string, @Query() q: ListSubmissionsQueryDto) { return this.svc.submissions(u, id, q); }
  @Roles(...MANAGERS) @Patch('submissions/:submissionId/grade')
  grade(@CurrentUser() u: AuthUser, @Param('submissionId', uuid()) id: string, @Body() dto: GradeSubmissionDto) { return this.svc.grade(u, id, dto); }

  // aluno
  @Roles(UserRole.student) @Get('courses/:courseId/my-assignments') mine(@CurrentUser() u: AuthUser, @Param('courseId', uuid()) id: string) { return this.svc.mine(u, id); }
  @Roles(UserRole.student) @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('assignments/:assignmentId/submit') @UseInterceptors(attachment())
  submit(@CurrentUser() u: AuthUser, @Param('assignmentId', uuid()) id: string, @Body() dto: SubmitAssignmentDto, @UploadedFile(filePipe) file?: Express.Multer.File) {
    return this.svc.submit(u, id, dto.content, file);
  }

  // aluno dono ou gestor do curso
  @Get('submissions/:submissionId') details(@CurrentUser() u: AuthUser, @Param('submissionId', uuid()) id: string) { return this.svc.submissionDetails(u, id); }
}
