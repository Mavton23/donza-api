import { DifficultyLevel, PostAttachmentType, PostReactionType, PostType, PostVisibility } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, ToStringArray, Trim } from '@/common/utils/transform.decorators';

const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

const NormalizeTags = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : v)))].filter((v) => v !== '')
      : value,
  );

export class AttachmentDto {
  @IsUrl(URL_OPTS, { message: 'URL do anexo inválido' }) @MaxLength(512)
  url: string;

  @IsEnum(PostAttachmentType)
  type: PostAttachmentType;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  title?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreatePostDto {
  @Trim() @IsString() @MinLength(3, { message: 'O título deve ter pelo menos 3 caracteres' }) @MaxLength(120)
  title: string;

  /** HTML ou texto: o frontend deve sanitizar ao renderizar. */
  @IsString() @IsNotEmpty({ message: 'O conteúdo não pode estar vazio' }) @MaxLength(20000)
  content: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  excerpt?: string;

  @IsOptional() @IsEnum(PostType)
  postType?: PostType;

  /** Só tem efeito em `resource` e `assignment`. */
  @IsOptional() @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @IsOptional() @Trim() @IsUrl(URL_OPTS, { message: 'sourceUrl inválido' }) @MaxLength(512)
  sourceUrl?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isOriginalContent?: boolean;

  /** `restricted` só para moderação. */
  @IsOptional() @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  /** Só moderação. */
  @IsOptional() @ToBoolean() @IsBoolean()
  isPinned?: boolean;

  @IsOptional() @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10, { message: 'No máximo 10 tags' }) @IsString({ each: true }) @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true })
  objectives?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10, { message: 'No máximo 10 anexos' }) @ValidateNested({ each: true }) @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

/** Sem `status: deleted` (usa-se DELETE). Em `tags/objectives/attachments`, o conjunto enviado substitui o actual. */
export class UpdatePostDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20000)
  content?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  excerpt?: string;

  @IsOptional() @IsEnum(PostType)
  postType?: PostType;

  @IsOptional() @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @IsOptional() @Trim() @IsUrl(URL_OPTS) @MaxLength(512)
  sourceUrl?: string;

  @IsOptional() @IsBoolean()
  isOriginalContent?: boolean;

  @IsOptional() @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  /** Só moderação. */
  @IsOptional() @IsBoolean()
  isPinned?: boolean;

  /** Só moderação: fecha os comentários. */
  @IsOptional() @IsBoolean()
  isLocked?: boolean;

  @IsOptional() @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';

  @IsOptional() @NormalizeTags() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true })
  objectives?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class ListPostsQueryDto extends PaginationQueryDto {
  constructor() {
    super();
    this.limit = 20;
  }

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsEnum(PostType)
  postType?: PostType;

  @IsOptional() @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @IsOptional() @IsIn(['newest', 'oldest', 'mostViewed', 'mostCommented', 'topRated'])
  sort?: 'newest' | 'oldest' | 'mostViewed' | 'mostCommented' | 'topRated';

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10) @IsString({ each: true })
  tags?: string[];
}

export class MyPostsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';
}

export class ReactionDto {
  @IsEnum(PostReactionType, { message: 'Tipo de reação inválido' })
  type: PostReactionType;
}

export class CommentsQueryDto extends PaginationQueryDto {
  constructor() {
    super();
    this.limit = 20;
  }
}

export class CreateCommentDto {
  @Trim() @IsString() @MinLength(1, { message: 'O comentário não pode estar vazio' }) @MaxLength(1000)
  content: string;

  @IsOptional() @IsUUID()
  parentCommentId?: string;
}

export class UpdateCommentDto {
  @IsOptional() @Trim() @IsString() @MinLength(1) @MaxLength(1000)
  content?: string;

  /** Marca/desmarca como resposta aceite (posts do tipo `question`). */
  @IsOptional() @IsBoolean()
  isAnswer?: boolean;
}
