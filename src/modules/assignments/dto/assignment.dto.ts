import { Type } from 'class-transformer';
import { AssignmentStatus, SubmissionFormat, SubmissionStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

/** Extensões aceites nas entregas (têm de ter MIME correspondente em ALLOWED_MIME.batchAttachment). */
export const SUBMISSION_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'rar', 'txt', 'png', 'jpg', 'jpeg'] as const;

export class CreateAssignmentDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(200)
  title: string;

  @Trim() @IsString() @MinLength(10) @MaxLength(10_000)
  description: string;

  @IsOptional() @Type(() => Date) @IsDate()
  dueDate?: Date;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  maxScore?: number;

  /** Só `draft` (por omissão) ou `published` à criação. */
  @IsOptional() @IsIn([AssignmentStatus.draft, AssignmentStatus.published])
  status?: 'draft' | 'published';

  @IsOptional() @ToBoolean() @IsBoolean()
  allowLateSubmissions?: boolean;

  /** Percentagem descontada à nota de entregas tardias (0–100). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  latePenalty?: number;

  @IsOptional() @IsEnum(SubmissionFormat)
  submissionFormat?: SubmissionFormat;

  @IsOptional() @IsArray() @ArrayMaxSize(SUBMISSION_EXTENSIONS.length) @ArrayUnique() @IsIn(SUBMISSION_EXTENSIONS, { each: true })
  allowedFileTypes?: string[];

  @IsOptional() @IsUUID()
  moduleId?: string;

  @IsOptional() @IsUUID()
  lessonId?: string;
}

export class UpdateAssignmentDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(200)
  title?: string;

  @IsOptional() @Trim() @IsString() @MinLength(10) @MaxLength(10_000)
  description?: string;

  /** `null` remove o prazo. */
  @IsOptional() @Type(() => Date) @IsDate()
  dueDate?: Date | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  maxScore?: number;

  @IsOptional() @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @IsOptional() @ToBoolean() @IsBoolean()
  allowLateSubmissions?: boolean;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  latePenalty?: number;

  @IsOptional() @IsEnum(SubmissionFormat)
  submissionFormat?: SubmissionFormat;

  @IsOptional() @IsArray() @ArrayMaxSize(SUBMISSION_EXTENSIONS.length) @ArrayUnique() @IsIn(SUBMISSION_EXTENSIONS, { each: true })
  allowedFileTypes?: string[];

  @IsOptional() @IsUUID()
  moduleId?: string | null;

  @IsOptional() @IsUUID()
  lessonId?: string | null;
}

export class ListAssignmentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @IsOptional() @IsUUID()
  courseId?: string;
}

export class SubmitAssignmentDto {
  @IsOptional() @Trim() @IsString() @MaxLength(20_000)
  content?: string;
}

export class GradeSubmissionDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  grade: number;

  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  feedback?: string;
}

export class ListSubmissionsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;
}
