import { Type } from 'class-transformer';
import { PublicationStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class CreateCategoryDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(50)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'name deve ser um identificador em minúsculas (ex.: getting-started)' })
  name: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(30)
  icon?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000)
  displayOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(50)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'name deve ser um identificador em minúsculas (ex.: getting-started)' })
  name?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(30)
  icon?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000)
  displayOrder?: number;
}

export class CreateArticleDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(100)
  title: string;

  @Trim() @IsString() @MinLength(2) @MaxLength(50)
  category: string;

  @Trim() @IsString() @MinLength(10) @MaxLength(50_000)
  content: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  excerpt?: string;

  @IsOptional() @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}

export class UpdateArticleDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(100)
  title?: string;

  @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(50)
  category?: string;

  @IsOptional() @Trim() @IsString() @MinLength(10) @MaxLength(50_000)
  content?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  excerpt?: string;

  @IsOptional() @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}

export class ListArticlesQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(50)
  category?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;
}

export class AdminListArticlesQueryDto extends ListArticlesQueryDto {
  @IsOptional() @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}

export class SearchQueryDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  q: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 10;
}

export class PopularQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  limit: number = 5;
}

export class FeedbackDto {
  @IsBoolean()
  wasHelpful: boolean;

  @IsOptional() @Trim() @IsString() @MaxLength(500)
  comment?: string;
}

export class ListFeedbackQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(36)
  articleId?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  wasHelpful?: boolean;
}
