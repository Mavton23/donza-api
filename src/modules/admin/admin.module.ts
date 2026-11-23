import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminSystemService } from './admin-system.service';
import { AdminUsersService } from './admin-users.service';

@Module({ controllers: [AdminController], providers: [AdminStatsService, AdminUsersService, AdminSystemService] })
export class AdminModule {}
