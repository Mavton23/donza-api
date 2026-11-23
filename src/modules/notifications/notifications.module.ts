import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UserNotificationsService } from './user-notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, UserNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
