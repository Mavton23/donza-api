import { GroupTaskStatus, SharedContentType, TaskPriority, VoteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, IsUrl, MaxLength, MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, ToStringArray, Trim } from '@/common/utils/transform.decorators';

const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

// ── Tarefas ────────────────────────────────────────────────────────────────

export class CreateTaskDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title: string;

  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  deadline?: Date;

  @IsOptional() @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  deadline?: Date;

  @IsOptional() @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional() @IsEnum(GroupTaskStatus)
  status?: GroupTaskStatus;
}

export class AssignTaskDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true })
  userIds: string[];
}

export class MyAssignmentDto {
  @IsIn(['pending', 'completed', 'rejected'])
  status: 'pending' | 'completed' | 'rejected';
}

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(GroupTaskStatus)
  status?: GroupTaskStatus;

  @IsOptional() @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional() @ToBoolean()
  assignedToMe?: boolean;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['deadline', 'recent', 'priority'])
  sort?: 'deadline' | 'recent' | 'priority';
}

// ── Conteúdos partilhados ──────────────────────────────────────────────────

export class CreateContentDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @IsEnum(SharedContentType)
  fileType: SharedContentType;

  @IsOptional() @Trim() @IsUrl(URL_OPTS) @MaxLength(500)
  externalUrl?: string;
}

export class UpdateContentDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(150)
  title?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Trim() @IsUrl(URL_OPTS) @MaxLength(500)
  externalUrl?: string;
}

export class ListContentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(SharedContentType)
  fileType?: SharedContentType;

  @IsOptional() @IsUUID()
  uploaderId?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['recent', 'downloads'])
  sort?: 'recent' | 'downloads';
}

// ── Discussões ─────────────────────────────────────────────────────────────

export class CreateTopicDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(100)
  title: string;

  @Trim() @IsString() @MinLength(3) @MaxLength(10000)
  content: string;

  @IsOptional() @ToStringArray() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];
}

export class UpdateTopicDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(100)
  title?: string;

  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(10000)
  content?: string;

  @IsOptional() @ToStringArray() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];

  /** só moderação */
  @IsOptional() @ToBoolean()
  isPinned?: boolean;

  /** só moderação */
  @IsOptional() @ToBoolean()
  isClosed?: boolean;
}

export class ReplyDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(5000)
  content: string;
}

export class VoteDto {
  @IsEnum(VoteType)
  voteType: VoteType;
}

export class ReportTopicDto {
  @IsIn(['spam', 'inappropriate', 'off_topic', 'other'])
  reason: 'spam' | 'inappropriate' | 'off_topic' | 'other';
}

export class ListTopicsQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(30)
  tag?: string;

  @IsOptional() @ToBoolean()
  solved?: boolean;

  @IsOptional() @IsIn(['recent', 'activity', 'replies'])
  sort?: 'recent' | 'activity' | 'replies';
}

export class ListRepliesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['top', 'oldest'])
  sort?: 'top' | 'oldest';
}
