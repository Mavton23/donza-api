import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '@/common/utils/transform.decorators';

export class GlobalSearchQueryDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  q: string;

  @IsOptional() @IsIn(['all', 'courses', 'events', 'communities', 'people'])
  type: 'all' | 'courses' | 'events' | 'communities' | 'people' = 'all';

  /** Máximo por tipo. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  limit: number = 5;
}

export class SearchInstructorsQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  expertise?: string;

  @IsOptional() @IsUUID()
  institutionId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 20;
}

export class QueryOnlyDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 20;
}

export class MessageableQueryDto extends QueryOnlyDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  declare q: string;
}
