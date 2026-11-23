import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AdminNotifyDto, ListNotificationsQueryDto, UpdatePreferencesDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

const EMAIL_KEYS = ['eventReminders', 'taskDeadlines', 'newMessages', 'courseUpdates', 'reviewReplies'] as const;

const DEFAULT_PREFS = {
  inApp: true,
  email: { eventReminders: true, taskDeadlines: true, newMessages: true, courseUpdates: false, reviewReplies: true },
};

type Prefs = { inApp: boolean; email: Record<(typeof EMAIL_KEYS)[number], boolean> };

/** API do utilizador sobre as suas notificações e preferências. */
@Injectable()
export class UserNotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async list(userId: string, q: ListNotificationsQueryDto) {
    // Como no Express, por omissão só as não lidas.
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(q.unreadOnly !== false && { isRead: false }),
      ...(q.type && { type: q.type }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
      // notificações agendadas para o futuro (lembretes) ainda não existem para o utilizador
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { notificationId: true, type: true, title: true, message: true, relatedEntityId: true, isRead: true, metadata: true, createdAt: true },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
    });
    return { success: true, data: { count, hasUnread: count > 0 } };
  }

  /** `updateMany` filtrado por dono: não revela se o id existe para outro utilizador (404 em ambos). */
  async markRead(userId: string, notificationId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { notificationId, userId }, data: { isRead: true } });
    if (!count) throw new NotFoundException('Notificação não encontrada');
    return { success: true, message: 'Notificação marcada como lida' };
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { success: true, data: { updated: count } };
  }

  async remove(userId: string, notificationId: string) {
    const { count } = await this.prisma.notification.deleteMany({ where: { notificationId, userId } });
    if (!count) throw new NotFoundException('Notificação não encontrada');
    return { success: true, message: 'Notificação eliminada' };
  }

  async getPreferences(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { userId }, select: { notificationPreferences: true } });
    if (!u) throw new NotFoundException('Utilizador não encontrado');
    return { success: true, data: this.normalize(u.notificationPreferences) };
  }

  /** Merge parcial sob bloqueio da linha: dois PUT em simultâneo não perdem chaves. */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const merged = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ notificationPreferences: unknown }[]>`
        SELECT "notificationPreferences" FROM users WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Utilizador não encontrado');
      const current = this.normalize(rows[0].notificationPreferences);
      const next: Prefs = {
        inApp: dto.inApp ?? current.inApp,
        email: { ...current.email, ...Object.fromEntries(Object.entries(dto.email ?? {}).filter(([, v]) => typeof v === 'boolean')) },
      };
      await tx.user.update({ where: { userId }, data: { notificationPreferences: next } });
      return next;
    });
    return { success: true, data: merged };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(userId: string, q: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(q.unreadOnly === true && { isRead: false }),
      ...(q.type && { type: q.type }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async adminSend(admin: AuthUser, dto: AdminNotifyDto) {
    const existing = await this.prisma.user.count({ where: { userId: { in: dto.userIds } } });
    if (existing !== new Set(dto.userIds).size) throw new NotFoundException('Um ou mais destinatários não existem');
    await this.notifications.notifyMany(dto.userIds, NotificationType[dto.type ?? 'DONZA_NOTIFICATION'], {
      title: dto.title, message: dto.message, metadata: { sentBy: admin.userId },
    });
    return { success: true, data: { recipients: existing } };
  }

  /** Completa o que falta com os valores por omissão e descarta chaves desconhecidas. */
  private normalize(raw: unknown): Prefs {
    const r = (raw && typeof raw === 'object' ? raw : {}) as { inApp?: unknown; email?: Record<string, unknown> };
    const email = { ...DEFAULT_PREFS.email };
    for (const k of EMAIL_KEYS) if (typeof r.email?.[k] === 'boolean') email[k] = r.email[k] as boolean;
    return { inApp: typeof r.inApp === 'boolean' ? r.inApp : true, email };
  }
}
