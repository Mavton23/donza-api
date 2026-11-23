import { Type } from 'class-transformer';
import { InstructorLinkStatus, PublicationStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { NormalizeEmail, Trim } from '@/common/utils/transform.decorators';

export class SendInviteDto {
  /** Um dos dois: `instructorId` ou `email`. */
  @ValidateIf((o: SendInviteDto) => !o.email) @IsUUID()
  instructorId?: string;

  @ValidateIf((o: SendInviteDto) => !o.instructorId) @NormalizeEmail() @IsEmail()
  email?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(1000)
  message?: string;
}

export class RespondInviteDto {
  @IsUUID()
  inviteId: string;

  @IsBoolean()
  accept: boolean;
}

export class ListInvitesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(InstructorLinkStatus)
  status?: InstructorLinkStatus;
}

export class ListInstructorsQueryDto extends PaginationQueryDto {
  /** `accepted` (por omissão, público). Os restantes só para a própria instituição/admin. */
  @IsOptional() @IsEnum(InstructorLinkStatus)
  status: InstructorLinkStatus = InstructorLinkStatus.accepted;
}

export class ListMembersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['instructor', 'student'])
  role: 'instructor' | 'student' = 'student';

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;
}

export class InstitutionCoursesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}

export class LimitQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 10;
}

export class AnalyticsQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d', '12m'])
  period: '7d' | '30d' | '90d' | '12m' = '30d';
}
