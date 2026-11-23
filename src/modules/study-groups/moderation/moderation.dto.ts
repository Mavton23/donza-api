import { Type } from 'class-transformer';
import { AppealStatus, ModerationActionType, ScanStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { Trim } from '@/common/utils/transform.decorators';

export const MAX_MUTE_MINUTES = 43_200; // 30 dias
export const MODERATOR_MAX_MUTE_MINUTES = 1_440; // 24 h

export class ReasonedActionDto {
  @IsUUID() userId: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class MuteDto extends ReasonedActionDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_MUTE_MINUTES) minutes: number;
}

export class ReverseDto {
  @IsUUID() userId: string;
  @IsOptional() @Trim() @IsString() @MaxLength(500) reason?: string;
}

export class ListActionsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ModerationActionType) type?: ModerationActionType;
  @IsOptional() @IsUUID() userId?: string;
}

export class ScanDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days: number = 7;
  /** Sensibilidade: `high` assinala mais conteúdo (limiar de risco mais baixo). */
  @IsOptional() @IsIn(['low', 'medium', 'high']) sensitivity: 'low' | 'medium' | 'high' = 'medium';
}

export class ListScansQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ScanStatus) status?: ScanStatus;
}

export class ReviewScanDto {
  @IsIn(['reviewed', 'falsePositive', 'actioned']) status: 'reviewed' | 'falsePositive' | 'actioned';
  /** Só com `actioned`: apaga o conteúdo assinalado. */
  @IsOptional() @IsBoolean() removeContent?: boolean;
}

export class CreateAppealDto {
  @IsUUID() actionId: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(1000) message: string;
}

export class DecideAppealDto {
  @IsIn(['accepted', 'rejected']) decision: 'accepted' | 'rejected';
  @IsOptional() @Trim() @IsString() @MaxLength(500) note?: string;
}

export class ListAppealsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(AppealStatus) status?: AppealStatus;
}
