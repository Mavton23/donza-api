import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { UPLOAD_POLICIES, MAX_FILE_SIZE, ALLOWED_MIME } from '@/common/config/upload.config';
import { CurrentUser, OptionalAuth, Public, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { CoursesService } from './courses.service';
import {
  AdminListCoursesQueryDto,
  CreateCourseDto,
  EnrolledQueryDto,
  FeaturedQueryDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
  UserCoursesQueryDto,
} from './dto/course.dto';
import { EnrollmentsService } from './enrollments.service';

const coverInterceptor = () =>
  FileInterceptor('coverImage', {
    limits: { fileSize: MAX_FILE_SIZE.IMAGE, files: 1 },
    fileFilter: (_req, file, cb) =>
      (ALLOWED_MIME.images as readonly string[]).includes(file.mimetype)
        ? cb(null, true)
        : cb(new BadRequestException('A capa deve ser uma imagem JPEG, PNG ou WEBP'), false),
  });

const COURSE_AUTHORS = [UserRole.instructor, UserRole.institution, UserRole.admin] as const;
const coverPipe = (required: boolean) => new FileValidationPipe({ ...UPLOAD_POLICIES.coverImage, required });

/**
 * Ordem das rotas: as estáticas (`featured`, `admin/all`, `users/...`) vêm antes de `:idOrSlug`.
 */
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  @Public() @Get()
  list(@Query() q: ListCoursesQueryDto) {
    return this.courses.listPublic(q);
  }

  @Public() @Get('featured')
  featured(@Query() q: FeaturedQueryDto) {
    return this.courses.featured(q);
  }

  @Roles(UserRole.admin) @Get('admin/all')
  listAdmin(@Query() q: AdminListCoursesQueryDto) {
    return this.courses.listAdmin(q);
  }

  @Get('users/:userId')
  byUser(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Query() q: UserCoursesQueryDto) {
    return this.courses.listByUser(user, userId, q);
  }

  @Get('users/:userId/counts')
  counts(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.courses.countsByStatus(user, userId);
  }

  @Get('users/:userId/enrolled')
  enrolled(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Query() q: EnrolledQueryDto) {
    return this.enrollments.enrolledCourses(user, userId, q);
  }

  /** Aceita UUID ou slug. Com token, devolve também `viewer.isEnrolled`. */
  @OptionalAuth() @Get(':idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: AuthUser) {
    return this.courses.getDetail(idOrSlug, user);
  }

  /** multipart/form-data; imagem no campo `coverImage` (obrigatória). */
  @Roles(...COURSE_AUTHORS) @RequireApproved() @Post()
  @UseInterceptors(coverInterceptor())
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCourseDto,
    @UploadedFile(coverPipe(true)) cover: Express.Multer.File,
  ) {
    return this.courses.create(user, dto, cover);
  }

  @Roles(...COURSE_AUTHORS) @RequireApproved() @Patch(':courseId')
  @UseInterceptors(coverInterceptor())
  update(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UpdateCourseDto,
    @UploadedFile(coverPipe(false)) cover: Express.Multer.File | undefined,
  ) {
    return this.courses.update(user, courseId, dto, cover);
  }

  @Roles(...COURSE_AUTHORS) @RequireApproved() @Delete(':courseId')
  remove(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.courses.remove(user, courseId);
  }
}
