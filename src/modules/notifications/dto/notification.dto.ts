import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  /** `true` (omissão no Express) devolve só as não lidas; `false` devolve todas. */
  @IsOptional() @ToBoolean() @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional() @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}

export class EmailPreferencesDto {
  @IsOptional() @IsBoolean() eventReminders?: boolean;
  @IsOptional() @IsBoolean() taskDeadlines?: boolean;
  @IsOptional() @IsBoolean() newMessages?: boolean;
  @IsOptional() @IsBoolean() courseUpdates?: boolean;
  @IsOptional() @IsBoolean() reviewReplies?: boolean;
}

/** Actualização parcial: só as chaves enviadas mudam. */
export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean()
  inApp?: boolean;

  @IsOptional() @ValidateNested() @Type(() => EmailPreferencesDto)
  email?: EmailPreferencesDto;
}

export class AdminNotifyDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  userIds: string[];

  @Trim() @IsString() @MinLength(1) @MaxLength(100)
  title: string;

  @Trim() @IsString() @MinLength(1) @MaxLength(2000)
  message: string;

  /** Só tipos "de sistema" podem ser enviados à mão (não se forja, por ex., COURSE_COMPLETION). */
  @IsOptional() @IsEnum(['DONZA_NOTIFICATION', 'SYSTEM_ALERT'])
  type?: 'DONZA_NOTIFICATION' | 'SYSTEM_ALERT';
}
