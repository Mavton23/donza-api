import { OmitType, PartialType } from '@nestjs/mapped-types';
import { EventStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class CreateEventDto {
  @Trim() @IsString() @MinLength(3, { message: 'O título deve ter pelo menos 3 caracteres' }) @MaxLength(150)
  title: string;

  @IsOptional() @Trim() @IsString() @MaxLength(10000)
  description?: string;

  @Type(() => Date) @IsDate({ message: 'startDate inválida' })
  startDate: Date;

  @IsOptional() @Type(() => Date) @IsDate({ message: 'endDate inválida' })
  endDate?: Date;

  @IsOptional() @Trim() @IsString() @MaxLength(255)
  location?: string;

  @IsOptional() @ToBoolean() @IsBoolean()
  isOnline?: boolean;

  @IsOptional() @Trim() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'meetingUrl inválido' }) @MaxLength(500)
  meetingUrl?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000)
  maxParticipants?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  price?: number;

  /** Só admin: define outro organizador (instrutor, instituição ou admin). */
  @IsOptional() @IsUUID()
  organizerId?: string;
}

/**
 * `organizerId` fora do update: transferir evento é uma acção de admin com regras próprias.
 * `status` aceita só transições válidas (ver EventsService.assertTransition).
 */
export class UpdateEventDto extends PartialType(OmitType(CreateEventDto, ['organizerId'] as const)) {
  @IsOptional() @IsEnum(EventStatus)
  status?: EventStatus;
}

export class ListEventsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['scheduled', 'live', 'completed', 'canceled'])
  status?: EventStatus;

  @IsOptional() @IsIn(['online', 'in-person'])
  type?: 'online' | 'in-person';

  /** YYYY-MM-DD (ou ISO): eventos que começam nesse dia (UTC). */
  @IsOptional() @Type(() => Date) @IsDate()
  date?: Date;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['upcoming', 'recent'])
  sort?: 'upcoming' | 'recent';
}

export class MyEventsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['upcoming', 'past'])
  when?: 'upcoming' | 'past';
}

export class AttendanceDto {
  @IsBoolean()
  attended: boolean;
}
