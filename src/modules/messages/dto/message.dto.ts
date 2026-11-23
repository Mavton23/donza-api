import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class SendMessageDto {
  /** Opcional só quando há anexo. */
  @IsOptional() @Trim() @IsString() @MaxLength(5000)
  content?: string;

  @IsOptional() @IsUUID()
  replyToId?: string;
}

export class StartConversationDto {
  @IsUUID()
  userId: string;

  @Trim() @IsString() @MinLength(1) @MaxLength(5000)
  content: string;
}

export class CreateMessageRequestDto {
  @IsUUID()
  receiverId: string;

  @Trim() @IsString() @MinLength(3) @MaxLength(150)
  subject: string;

  @Trim() @IsString() @MinLength(1) @MaxLength(2000)
  message: string;
}

export class EditMessageDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(5000)
  content: string;
}

export class ListMessagesQueryDto {
  /** Cursor: devolve mensagens anteriores a esta. */
  @IsOptional() @IsUUID()
  before?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 30;
}

export class ListRequestsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString()
  box?: 'received' | 'sent';

  @IsOptional() @IsString()
  status?: 'pending' | 'approved' | 'rejected';
}

export class ConversationSettingsDto {
  @IsOptional() @ToBoolean() @IsBoolean()
  notifications?: boolean;

  @IsOptional() @ToBoolean() @IsBoolean()
  muted?: boolean;

  /** Silenciar por N minutos (implica muted). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60 * 24 * 30)
  muteMinutes?: number;
}

export class GroupTopicDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(150)
  topic: string;
}
