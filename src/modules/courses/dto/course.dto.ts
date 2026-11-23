import { PartialType, OmitType } from '@nestjs/mapped-types';
import { DifficultyLevel, EnrollmentStatus, PublicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, ToStringArray, Trim } from '@/common/utils/transform.decorators';

/** Campos multipart: o ficheiro `coverImage` vem à parte; o resto chega como strings (ver Transform). */
export class CreateCourseDto {
  @Trim() @IsString() @MinLength(5, { message: 'O título do curso deve ter pelo menos 5 caracteres' }) @MaxLength(150)
  title: string;

  @Trim() @IsString() @MinLength(10, { message: 'A descrição curta deve ter pelo menos 10 caracteres' }) @MaxLength(200)
  shortDescription: string;

  @IsOptional() @Trim() @IsString() @MaxLength(20000)
  description?: string;

  @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(60)
  category?: string;

  @IsOptional() @IsEnum(DifficultyLevel)
  level?: DifficultyLevel;

  @IsOptional() @Trim() @IsString() @MaxLength(40)
  language?: string;

  /** Horas. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000)
  duration?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  price?: number;

  @IsOptional() @Trim() @IsString() @Length(3, 3) @IsIn(['USD', 'MZN', 'EUR', 'ZAR'])
  currency?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isPublic?: boolean;

  /** Atalho do Express (`isPublished=true` => publicado). */
  @IsOptional() @ToBoolean() @IsBoolean()
  isPublished?: boolean;

  @IsOptional() @ToStringArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true })
  requirements?: string[];

  @IsOptional() @ToStringArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true })
  learningOutcomes?: string[];

  /**
   * Instrutor responsável. Obrigatório para instituição/admin; ignorado para instrutores
   * (são sempre o próprio). Numa instituição tem de ser um instrutor ligado (accepted).
   */
  @IsOptional() @IsUUID()
  instructorId?: string;

  /** Só admin: instituição organizadora. */
  @IsOptional() @IsUUID()
  organizerId?: string;
}

/** Whitelist explícita: o Express fazia `course.update(req.body)` (mass assignment de rating, instructorId, metrics…). */
export class UpdateCourseDto extends PartialType(OmitType(CreateCourseDto, ['isPublished', 'organizerId'] as const)) {
  @IsOptional() @IsEnum(PublicationStatus)
  status?: PublicationStatus;

  /** Substituir a capa por defeito? Para remover a capa actual sem nova: `removeCover=true`. */
  @IsOptional() @ToBoolean() @IsBoolean()
  removeCover?: boolean;
}

export class ListCoursesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(DifficultyLevel) level?: DifficultyLevel;
  @IsOptional() @Trim() @IsString() @MaxLength(40) language?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['newest', 'oldest', 'popular', 'rating', 'title']) sort?: 'newest' | 'oldest' | 'popular' | 'rating' | 'title';
}

export class AdminListCoursesQueryDto extends ListCoursesQueryDto {
  @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
}

export class FeaturedQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit: number = 5;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) minRating: number = 4.5;
}

export class UserCoursesQueryDto {
  @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
}

export class EnrolledQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsEnum(DifficultyLevel) level?: DifficultyLevel;
  @IsOptional() @IsEnum(EnrollmentStatus) status?: EnrollmentStatus;
  @IsOptional() @IsIn(['recent', 'progress', 'rating', 'title']) sort?: 'recent' | 'progress' | 'rating' | 'title';
}
