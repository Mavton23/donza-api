import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AdminNotifyDto, ListNotificationsQueryDto, UpdatePreferencesDto } from './dto/notification.dto';
import { UserNotificationsService } from './user-notifications.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`unread-count`, `read-all`, `preferences`, `admin/*`) antes de `:id`. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: UserNotificationsService) {}

  @Get() list(@CurrentUser('userId') id: string, @Query() q: ListNotificationsQueryDto) { return this.svc.list(id, q); }

  @Get('unread-count') unread(@CurrentUser('userId') id: string) { return this.svc.unreadCount(id); }

  @Patch('read-all') readAll(@CurrentUser('userId') id: string) { return this.svc.markAllRead(id); }

  @Get('preferences') prefs(@CurrentUser('userId') id: string) { return this.svc.getPreferences(id); }

  @Put('preferences')
  updatePrefs(@CurrentUser('userId') id: string, @Body() dto: UpdatePreferencesDto) { return this.svc.updatePreferences(id, dto); }

  @Roles(UserRole.admin) @Get('admin/users/:userId')
  adminList(@Param('userId', uuid()) userId: string, @Query() q: ListNotificationsQueryDto) { return this.svc.adminList(userId, q); }

  @Roles(UserRole.admin) @Post('admin') @HttpCode(201)
  adminSend(@CurrentUser() u: AuthUser, @Body() dto: AdminNotifyDto) { return this.svc.adminSend(u, dto); }

  @Patch(':id/read') read(@CurrentUser('userId') uid: string, @Param('id', uuid()) id: string) { return this.svc.markRead(uid, id); }

  @Delete(':id') remove(@CurrentUser('userId') uid: string, @Param('id', uuid()) id: string) { return this.svc.remove(uid, id); }
}
