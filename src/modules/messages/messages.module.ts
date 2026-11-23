import { Module } from '@nestjs/common';
import { DirectMessagesService } from './direct-messages.service';
import { CommunityChatController, GroupChatController, MessagesController } from './messages.controllers';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController, GroupChatController, CommunityChatController],
  providers: [MessagesService, DirectMessagesService],
  exports: [MessagesService, DirectMessagesService],
})
export class MessagesModule {}
