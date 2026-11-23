import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import {
  ConversationSettingsDto, CreateMessageRequestDto, EditMessageDto, GroupTopicDto, ListMessagesQueryDto, ListRequestsQueryDto, SendMessageDto, StartConversationDto,
} from './dto/message.dto';
import { DirectMessagesService } from './direct-messages.service';
import { ATTACHMENT_POLICY, MessagesService } from './messages.service';

const uuid = () => new ParseUUIDPipe();
const attachment = () => UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: ATTACHMENT_POLICY.maxSize, files: 1 } }));
const SEND_LIMIT = { default: { limit: 60, ttl: 60_000 } };

/** Rotas estáticas (`conversations`, `requests`, `unread-count`) vêm antes de `:messageId`. */
@Controller('messages')
export class MessagesController {
  constructor(private readonly direct: DirectMessagesService, private readonly messages: MessagesService) {}

  @Get('unread-count') unread(@CurrentUser('userId') id: string) { return this.messages.unreadTotal(id); }

  @Get('conversations') conversations(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) { return this.direct.list(u, q); }

  @RequireApproved() @Post('conversations') @Throttle(SEND_LIMIT)
  start(@CurrentUser() u: AuthUser, @Body() dto: StartConversationDto) { return this.direct.start(u, dto); }

  @Get('conversations/:id') detail(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.direct.detail(u, id); }

  @Patch('conversations/:id/settings')
  settings(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ConversationSettingsDto) { return this.direct.settings(u, id, dto); }

  @Get('conversations/:id/messages')
  list(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Query() q: ListMessagesQueryDto) { return this.messages.list(u, 'conversation', id, q); }

  /** JSON ou multipart (`attachment`). */
  @RequireApproved() @Post('conversations/:id/messages') @Throttle(SEND_LIMIT) @attachment()
  send(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: SendMessageDto, @UploadedFile() file?: Express.Multer.File) {
    return this.direct.sendInConversation(u, id, dto.content, dto.replyToId, file);
  }

  @Post('conversations/:id/read') @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.messages.markRead(u, 'conversation', id); }

  @Get('requests') requests(@CurrentUser() u: AuthUser, @Query() q: ListRequestsQueryDto) { return this.direct.listRequests(u, q); }

  @RequireApproved() @Post('requests') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createRequest(@CurrentUser() u: AuthUser, @Body() dto: CreateMessageRequestDto) { return this.direct.createRequest(u, dto); }

  @RequireApproved() @Post('requests/:id/approve') @HttpCode(200)
  approve(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.direct.review(u, id, true); }

  @RequireApproved() @Post('requests/:id/reject') @HttpCode(200)
  reject(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.direct.review(u, id, false); }

  @Delete('requests/:id') cancel(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.direct.cancelRequest(u, id); }

  @RequireApproved() @Patch(':messageId')
  edit(@CurrentUser() u: AuthUser, @Param('messageId', uuid()) id: string, @Body() dto: EditMessageDto) { return this.messages.edit(u, id, dto); }

  @Delete(':messageId') remove(@CurrentUser() u: AuthUser, @Param('messageId', uuid()) id: string) { return this.messages.remove(u, id); }
}

@Controller('study-groups/:groupId/messages')
export class GroupChatController {
  constructor(private readonly messages: MessagesService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListMessagesQueryDto) { return this.messages.list(u, 'group', g, q); }

  @RequireApproved() @Post() @Throttle(SEND_LIMIT) @attachment()
  send(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: SendMessageDto, @UploadedFile() file?: Express.Multer.File) { return this.messages.send(u, 'group', g, dto, file); }

  @Post('read') @HttpCode(200) read(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string) { return this.messages.markRead(u, 'group', g); }

  @RequireApproved() @Post('topic') @HttpCode(200)
  topic(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: GroupTopicDto) { return this.messages.changeGroupTopic(u, g, dto.topic); }
}

@Controller('communities/:communityId/messages')
export class CommunityChatController {
  constructor(private readonly messages: MessagesService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('communityId') c: string, @Query() q: ListMessagesQueryDto) { return this.messages.list(u, 'community', c, q); }

  @RequireApproved() @Post() @Throttle(SEND_LIMIT) @attachment()
  send(@CurrentUser() u: AuthUser, @Param('communityId') c: string, @Body() dto: SendMessageDto, @UploadedFile() file?: Express.Multer.File) { return this.messages.send(u, 'community', c, dto, file); }

  @Post('read') @HttpCode(200) read(@CurrentUser() u: AuthUser, @Param('communityId') c: string) { return this.messages.markRead(u, 'community', c); }
}
