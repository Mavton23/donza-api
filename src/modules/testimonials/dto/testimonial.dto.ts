import { Type } from 'class-transformer';
import { ApprovalStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class CreateTestimonialDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(1000)
  content: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating: number;
}

export class UpdateTestimonialDto {
  @IsOptional() @Trim() @IsString() @MinLength(10) @MaxLength(1000)
  content?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;
}

/** Só o admin cria testemunhos externos (clientes/parceiros sem conta). */
export class CreateExternalTestimonialDto extends CreateTestimonialDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  externalAuthor: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  externalRole?: string;

  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500)
  externalAvatarUrl?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  featured?: boolean;
}

export class ModerateTestimonialDto {
  @IsIn([ApprovalStatus.approved, ApprovalStatus.rejected])
  status: 'approved' | 'rejected';

  @IsOptional() @IsBoolean()
  featured?: boolean;
}

export class ListTestimonialsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  minRating?: number;
}

export class FeaturedQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  limit: number = 6;
}

export class AdminListTestimonialsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional() @ToBoolean() @IsBoolean()
  featured?: boolean;
}
