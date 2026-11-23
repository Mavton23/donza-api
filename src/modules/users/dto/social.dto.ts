import { UserRole } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { Trim } from '@/common/utils/transform.decorators';

export class SearchUsersQueryDto extends PaginationQueryDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  q: string;

  @IsOptional() @IsIn([UserRole.student, UserRole.instructor, UserRole.institution])
  role?: 'student' | 'instructor' | 'institution';
}

export class SetPrivacyDto {
  @IsBoolean()
  isPrivate: boolean;
}
