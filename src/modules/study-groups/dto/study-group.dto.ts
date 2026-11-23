import { StudyGroupPrivacy, StudyGroupStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, ToStringArray, Trim } from '@/common/utils/transform.decorators';

const ToJson = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value) as unknown; } catch { return value; }
  });
const NormalizeTags = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)))].filter((v) => v !== '') : value,
  );

/** Campos multipart (a capa `coverImage` chega como ficheiro). */
export class CreateStudyGroupDto {
  @Trim() @IsString() @MinLength(3, { message: 'O nome deve ter pelo menos 3 caracteres' }) @MaxLength(100)
  name: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  goals?: string;

  /** Sem comunidade => grupo autónomo. Com comunidade, é preciso ser membro activo. */
  @IsOptional() @IsUUID()
  communityId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(500)
  maxMembers?: number;

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];

  /** { days?: string[], time?: 'HH:mm', timezone?, frequency? } — objecto pequeno, validado no serviço. */
  @IsOptional() @ToJson() @IsObject()
  meetingSchedule?: Record<string, unknown>;

  /**
   * public: qualquer membro entra (ou pede, se `approvalRequired`).
   * private: descobrível, entra-se com código/convite ou pedido aprovado.
   * invite_only: só com código ou convite directo.
   */
  @IsOptional() @IsEnum(StudyGroupPrivacy)
  privacy?: StudyGroupPrivacy;

  @IsOptional() @ToBoolean() @IsBoolean()
  approvalRequired?: boolean;
}

export class UpdateStudyGroupDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(100)
  name?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  goals?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(500)
  maxMembers?: number;

  @IsOptional() @ToStringArray() @NormalizeTags() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional() @ToJson() @IsObject()
  meetingSchedule?: Record<string, unknown>;

  /** Só o líder. */
  @IsOptional() @IsEnum(StudyGroupPrivacy)
  privacy?: StudyGroupPrivacy;

  @IsOptional() @ToBoolean() @IsBoolean()
  approvalRequired?: boolean;

  /** Só o líder. */
  @IsOptional() @IsEnum(StudyGroupStatus)
  status?: StudyGroupStatus;

  @IsOptional() @ToBoolean() @IsBoolean()
  removeCover?: boolean;
}

export class ListStudyGroupsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID()
  communityId?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(30)
  tag?: string;

  @IsOptional() @IsEnum(StudyGroupPrivacy)
  privacy?: StudyGroupPrivacy;

  @IsOptional() @IsEnum(StudyGroupStatus)
  status?: StudyGroupStatus;

  /** Só os grupos a que pertenço (exige sessão). */
  @IsOptional() @ToBoolean() @IsBoolean()
  mine?: boolean;

  @IsOptional() @IsIn(['newest', 'popular', 'name'])
  sort?: 'newest' | 'popular' | 'name';
}

export class MembersQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(50)
  search?: string;
}

export class JoinGroupDto {
  /** Código do grupo (private/invite_only). */
  @IsOptional() @Trim() @IsString() @Matches(/^[a-f0-9]{16}$/, { message: 'Código de convite inválido' })
  inviteCode?: string;

  /** Mensagem para a liderança ao pedir entrada. */
  @IsOptional() @Trim() @IsString() @MaxLength(500)
  message?: string;
}

export class ReviewRequestDto {
  @IsOptional() @Trim() @IsString() @MaxLength(500)
  responseMessage?: string;
}

export class InviteUsersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true })
  userIds: string[];
}

export class UpdateMemberDto {
  @IsOptional() @IsIn(['member', 'moderator', 'co-leader'])
  role?: 'member' | 'moderator' | 'co-leader';

  @IsOptional() @IsIn(['active', 'muted', 'banned'])
  status?: 'active' | 'muted' | 'banned';

  /** Minutos de silenciamento (só com status=muted). Sem valor => até ser levantado. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60 * 24 * 90)
  muteMinutes?: number;
}

export class TransferLeadershipDto {
  @IsUUID()
  userId: string;
}

export class MeetingDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @Type(() => Date) @IsDate()
  startTime: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  endTime?: Date;

  @IsOptional() @Trim() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(500)
  meetingUrl?: string;

  /** { frequency: 'daily'|'weekly'|'monthly', until?: ISO } — só informativo (não gera ocorrências). */
  @IsOptional() @IsObject()
  recurring?: Record<string, unknown>;
}

export class UpdateMeetingDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  startTime?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  endTime?: Date;

  @IsOptional() @Trim() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(500)
  meetingUrl?: string;

  @IsOptional() @IsObject()
  recurring?: Record<string, unknown>;

  @IsOptional() @IsIn(['scheduled', 'completed', 'canceled'])
  status?: 'scheduled' | 'completed' | 'canceled';
}

export class ListMeetingsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['upcoming', 'past', 'all'])
  when?: 'upcoming' | 'past' | 'all';
}

export class RsvpDto {
  @IsIn(['confirmed', 'declined'])
  status: 'confirmed' | 'declined';
}

export class StatsQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d';
}
