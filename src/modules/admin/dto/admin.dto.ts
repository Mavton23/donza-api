import { Type } from 'class-transformer';
import { ActivityType, ApprovalStatus, UserRole, UserStatus } from '@prisma/client';
import { IsBoolean, IsDate, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { NormalizeEmail, ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class RegisterAdminDto {
  @NormalizeEmail() @IsEmail() @MaxLength(254)
  email: string;

  @Trim() @IsString() @Length(3, 30) @Matches(/^[a-zA-Z0-9_]+$/, { message: 'O nome de utilizador só pode conter letras, números e underscores' })
  username: string;

  @IsString() @MinLength(12, { message: 'A palavra-passe de um administrador deve ter pelo menos 12 caracteres' }) @MaxLength(72)
  password: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  fullName?: string;
}

export class ChartQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d', '12m'])
  period: '7d' | '30d' | '90d' | '12m' = '30d';
}

export class ListVerificationsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(UserStatus)
  status: UserStatus = UserStatus.pending;

  @IsOptional() @IsIn([UserRole.instructor, UserRole.institution])
  role?: 'instructor' | 'institution';

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;
}

export class ProcessVerificationDto {
  @IsIn([UserStatus.approved, UserStatus.rejected])
  status: 'approved' | 'rejected';

  /** Obrigatório ao rejeitar: é enviado ao utilizador. */
  @ValidateIf((o: ProcessVerificationDto) => o.status === 'rejected' || o.reason !== undefined)
  @Trim() @IsString() @Length(5, 1000)
  reason?: string;
}

export class ReviewDocumentDto {
  @IsIn([ApprovalStatus.approved, ApprovalStatus.rejected])
  status: 'approved' | 'rejected';

  @ValidateIf((o: ReviewDocumentDto) => o.status === 'rejected' || o.reason !== undefined)
  @Trim() @IsString() @Length(5, 1000)
  reason?: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional() @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional() @ToBoolean() @IsBoolean()
  isVerified?: boolean;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;
}

export class SetUserStatusDto {
  @IsIn([UserStatus.suspended, 'active'])
  status: 'suspended' | 'active';

  @ValidateIf((o: SetUserStatusDto) => o.status === 'suspended')
  @Trim() @IsString() @Length(5, 500)
  reason?: string;
}

export class ListActivitiesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ActivityType)
  type?: ActivityType;

  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @IsUUID()
  groupId?: string;

  @IsOptional() @IsUUID()
  courseId?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}

export class ListAuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  action?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}
