import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, MinLength, Min } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class CreateReviewDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating: number;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  comment?: string;
}

/** Pelo menos um campo (validado no serviço). `comment: ""` limpa o comentário. */
export class UpdateReviewDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  comment?: string;
}

export class ReplyDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(2000)
  reply: string;
}

export class VisibilityDto {
  @IsBoolean()
  isPublic: boolean;
}

export class ListReviewsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;

  @IsOptional() @IsIn(['recent', 'highest', 'lowest'])
  sort: 'recent' | 'highest' | 'lowest' = 'recent';
}

export class ReceivedReviewsQueryDto extends PaginationQueryDto {
  /** `false` = por responder. */
  @IsOptional() @ToBoolean() @IsBoolean()
  replied?: boolean;

  @IsOptional() @IsIn(['course', 'event'])
  entity?: 'course' | 'event';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;
}

export class AdminReviewsQueryDto extends PaginationQueryDto {
  @IsOptional() @ToBoolean() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsIn(['course', 'event'])
  entity?: 'course' | 'event';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;
}
