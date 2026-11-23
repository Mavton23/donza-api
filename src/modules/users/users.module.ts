import { Module } from '@nestjs/common';
import { PublicStatsController, SocialController } from './social.controller';
import { SocialService } from './social.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, SocialController, PublicStatsController],
  providers: [UsersService, SocialService],
  exports: [UsersService],
})
export class UsersModule {}
