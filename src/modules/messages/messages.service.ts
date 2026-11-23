import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationType, MessageType, NotificationType, Prisma } from '@prisma/client';
import { validateFile } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../storage/storage.service';
import { ChatCtx, resolveChat } from './chat-context';
import { EditMessageDto, ListMessagesQueryDto, SendMessageDto } from './dto/message.dto';

const USER_MIN = { userId: true, username: true, avatarUrl: true } as const;
/** Tecto diário por utilizador, em todos os chats (anti-spam). */
export const DAILY_MESSAGE_CAP = 300;
export const ATTACHMENT_POLICY = {
  allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as readonly string[],
  maxSize: 10 * 1024 * 1024,
};

const MESSAGE_INCLUDE = {
  sender: { select: USER_MIN },
  replyTo: { select: { messageId: true, content: true, sender: { select: USER_MIN } } },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export const shapeMessage = (m: MessageRow) => ({
  ...m,
  replyTo: m.replyTo && { ...m.replyTo, content: m.replyTo.content.length > 120 ? `${m.replyTo.content.slice(0, 117)}...` : m.replyTo.content },
});

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Empurra um evento a todos os membros do chat (incluindo os outros separadores de quem o causou). Nunca falha. */
  private async broadcast(ctx: ChatCtx, event: string, payload: Record<string, unknown>) {
    try { this.realtime.emitToUsers(await ctx.members(), event, { contextType: ctx.type, contextId: ctx.id, ...payload }); } catch { /* tempo real é opcional */ }
  }

  chat(user: AuthUser, type: ConversationType, id: string) {
    return resolveChat(this.prisma, user, type, id);
  }

  /** Mensagens mais recentes primeiro no cursor, devolvidas por ordem cronológica. */
  async list(user: AuthUser, type: ConversationType, id: string, q: ListMessagesQueryDto) {
    const ctx = await this.chat(user, type, id);
    let cursor: { createdAt: Date; messageId: string } | null = null;
    if (q.before) {
      cursor = await this.prisma.message.findFirst({ where: { messageId: q.before, contextType: type, contextId: ctx.id }, select: { createdAt: true, messageId: true } });
      if (!cursor) throw new BadRequestException('Cursor inválido');
    }
    const rows = await this.prisma.message.findMany({
      where: {
        contextType: type, contextId: ctx.id,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, messageId: { lt: cursor.messageId } }] }),
      },
      orderBy: [{ createdAt: 'desc' }, { messageId: 'desc' }], take: q.limit + 1, include: MESSAGE_INCLUDE,
    });
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit).reverse();
    let otherReadAt: Date | null = null;
    if (type === 'conversation') {
      otherReadAt = (await this.prisma.participant.findFirst({ where: { contextType: 'conversation', contextId: ctx.id, userId: { not: user.userId } }, select: { lastReadAt: true } }))?.lastReadAt ?? null;
    }
    return {
      success: true,
      data: page.map((m) => ({ ...shapeMessage(m), ...(type === 'conversation' && m.senderId === user.userId && { readByOther: !!otherReadAt && otherReadAt >= m.createdAt }) })),
      meta: { limit: q.limit, hasMore, nextBefore: hasMore ? page[0]?.messageId ?? null : null },
    };
  }

  /** Envia uma mensagem para qualquer chat. `extra` permite ao chamador validar regras específicas dentro da transacção. */
  async send(
    user: AuthUser, type: ConversationType, id: string, dto: SendMessageDto, file?: Express.Multer.File,
    opts: { ctx?: ChatCtx; beforeSend?: (tx: Prisma.TransactionClient, ctx: ChatCtx) => Promise<void>; messageType?: MessageType; metadata?: Prisma.InputJsonObject; notifyType?: NotificationType } = {},
  ) {
    const ctx = opts.ctx ?? (await this.chat(user, type, id));
    if (!ctx.canPost) throw new ForbiddenException('Não pode enviar mensagens neste chat');
    const content = dto.content ?? '';
    if (!content && !file) throw new BadRequestException('Escreva uma mensagem ou anexe um ficheiro');
    if (file) await validateFile(file, ATTACHMENT_POLICY);
    if (dto.replyToId && !(await this.prisma.message.findFirst({ where: { messageId: dto.replyToId, contextType: type, contextId: ctx.id }, select: { messageId: true } }))) {
      throw new BadRequestException('A mensagem a que responde não existe neste chat');
    }
    if (file && type === 'conversation') {
      const other = (await ctx.members()).find((u) => u !== user.userId);
      const prefs = other ? (await this.prisma.user.findUnique({ where: { userId: other }, select: { messagePreferences: true } }))?.messagePreferences : null;
      if (user.role !== 'admin' && !(prefs as { allowAttachments?: boolean } | null)?.allowAttachments) throw new ForbiddenException('O destinatário não aceita anexos');
    }

    const stored = file ? await this.storage.upload(file, { folder: `donza/messages/${type}/${ctx.id}`, resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image' }) : null;
    try {
      const msg = await this.prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ count: number }[]>`
          INSERT INTO message_limits ("userId", "date", "count") VALUES (${user.userId}::uuid, CURRENT_DATE, 1)
          ON CONFLICT ("userId", "date") DO UPDATE SET "count" = message_limits."count" + 1 WHERE message_limits."count" < ${DAILY_MESSAGE_CAP}
          RETURNING "count"`;
        if (!row) throw new HttpException({ message: 'Limite diário de mensagens atingido', code: 'DAILY_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
        if (opts.beforeSend) await opts.beforeSend(tx, ctx);
        const m = await tx.message.create({
          data: {
            senderId: user.userId, content, contextType: type, contextId: ctx.id, replyToId: dto.replyToId ?? null,
            type: opts.messageType ?? (stored ? (file!.mimetype === 'application/pdf' ? 'file' : 'image') : 'text'),
            metadata: { ...(opts.metadata ?? {}), ...(stored && { attachment: { url: stored.url, name: file!.originalname, size: file!.size, mimeType: file!.mimetype } }) },
          },
          include: MESSAGE_INCLUDE,
        });
        await tx.participant.upsert({
          where: { contextType_contextId_userId: { contextType: type, contextId: ctx.id, userId: user.userId } },
          create: { userId: user.userId, contextType: type, contextId: ctx.id, lastReadAt: m.createdAt, messageCount: 1 },
          update: { lastReadAt: m.createdAt, messageCount: { increment: 1 } },
        });
        if (type === 'conversation') {
          const count = await tx.message.count({ where: { contextType: 'conversation', contextId: ctx.id } });
          await tx.conversation.update({ where: { conversationId: ctx.id }, data: { lastMessageAt: m.createdAt, stats: { messageCount: count, participantCount: 2, lastActivity: m.createdAt.toISOString() } } });
        }
        return m;
      });
      await this.notifyRecipients(user, ctx, msg, opts.notifyType);
      await this.broadcast(ctx, 'message:new', { message: shapeMessage(msg) });
      return { success: true, data: shapeMessage(msg) };
    } catch (err) {
      if (stored) await this.storage.remove(stored.key, { resourceType: stored.resourceType });
      throw err;
    }
  }

  /**
   * Notifica quem não tem já uma notificação por ler deste chat (só a 1.ª mensagem não lida, para não inundar) e não o silenciou.
   * Nunca falha o envio.
   */
  private async notifyRecipients(user: AuthUser, ctx: ChatCtx, msg: MessageRow, notifyType?: NotificationType) {
    try {
      const members = (await ctx.members()).filter((u) => u !== user.userId);
      if (!members.length) return;
      const parts = await this.prisma.participant.findMany({ where: { contextType: ctx.type, contextId: ctx.id, userId: { in: members } } });
      const byUser = new Map(parts.map((p) => [p.userId, p]));
      const now = new Date();
      const type = notifyType ?? (ctx.type === 'conversation' ? NotificationType.NEW_DIRECT_MESSAGE : ctx.type === 'group' ? NotificationType.STUDY_GROUP_NEW_MESSAGE : NotificationType.NEW_MESSAGE);
      // quem já tem uma notificação por ler deste chat não recebe outra
      const pending = new Set((await this.prisma.notification.findMany({ where: { userId: { in: members }, type, relatedEntityId: ctx.id, isRead: false }, select: { userId: true } })).map((n) => n.userId));
      const targets = members.filter((u) => {
        const p = byUser.get(u);
        if (p && (!p.notifications || p.muted || (p.mutedUntil && p.mutedUntil > now))) return false;
        return !pending.has(u);
      });
      const preview = msg.content ? (msg.content.length > 100 ? `${msg.content.slice(0, 97)}...` : msg.content) : 'Enviou um anexo';
      await this.notifications.notifyMany(targets, type, {
        title: ctx.type === 'conversation' ? `Nova mensagem de ${msg.sender?.username ?? 'alguém'}` : `Nova mensagem em ${ctx.name}`,
        message: preview, relatedEntityId: ctx.id,
      });
    } catch { /* notificações nunca falham o envio */ }
  }

  async markRead(user: AuthUser, type: ConversationType, id: string) {
    const ctx = await this.chat(user, type, id);
    const now = new Date();
    await this.prisma.participant.upsert({
      where: { contextType_contextId_userId: { contextType: type, contextId: ctx.id, userId: user.userId } },
      create: { userId: user.userId, contextType: type, contextId: ctx.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    await this.prisma.notification.updateMany({
      where: { userId: user.userId, relatedEntityId: ctx.id, isRead: false, type: { in: [NotificationType.NEW_DIRECT_MESSAGE, NotificationType.STUDY_GROUP_NEW_MESSAGE, NotificationType.NEW_MESSAGE] } },
      data: { isRead: true },
    });
    this.realtime.emitToUsers([user.userId], 'chat:read', { contextType: ctx.type, contextId: ctx.id, lastReadAt: now });
    return { success: true, data: { lastReadAt: now } };
  }

  private async findMessage(messageId: string) {
    const m = await this.prisma.message.findUnique({ where: { messageId } });
    if (!m || !m.contextId) throw new NotFoundException('Mensagem não encontrada');
    return m as typeof m & { contextId: string };
  }

  async edit(user: AuthUser, messageId: string, dto: EditMessageDto) {
    const m = await this.findMessage(messageId);
    if (m.contextType !== 'conversation' && m.contextType !== 'group' && m.contextType !== 'community') throw new NotFoundException('Mensagem não encontrada');
    const ctx = await this.chat(user, m.contextType, m.contextId);
    if (m.senderId !== user.userId || !ctx.canPost) throw new ForbiddenException('Só o autor edita a sua mensagem');
    if (m.type !== 'text') throw new BadRequestException('Só mensagens de texto se editam');
    const updated = await this.prisma.message.update({ where: { messageId }, data: { content: dto.content, edited: true }, include: MESSAGE_INCLUDE });
    await this.broadcast(ctx, 'message:updated', { message: shapeMessage(updated) });
    return { success: true, data: shapeMessage(updated) };
  }

  async remove(user: AuthUser, messageId: string) {
    const m = await this.findMessage(messageId);
    if (m.contextType !== 'conversation' && m.contextType !== 'group' && m.contextType !== 'community') throw new NotFoundException('Mensagem não encontrada');
    const ctx = await this.chat(user, m.contextType, m.contextId);
    const own = m.senderId === user.userId;
    if (!own && !ctx.canModerate) throw new ForbiddenException('Sem permissão para apagar esta mensagem');
    await this.prisma.message.delete({ where: { messageId } });
    await this.storage.removeByUrl((m.metadata as { attachment?: { url?: string } } | null)?.attachment?.url);
    if (!own && m.senderId) {
      await this.notifications.notify(m.senderId, m.contextType === 'group' ? NotificationType.STUDY_GROUP_MESSAGE_DELETED : NotificationType.NEW_MESSAGE, {
        title: 'Mensagem removida', message: `Uma mensagem sua em "${ctx.name}" foi removida pela moderação.`, relatedEntityId: ctx.id,
      });
    }
    await this.broadcast(ctx, 'message:deleted', { messageId });
    return { success: true, message: 'Mensagem apagada' };
  }

  /** Muda o tópico do chat de um grupo (mensagem de sistema `topic_change`). */
  async changeGroupTopic(user: AuthUser, groupId: string, topic: string) {
    const ctx = await this.chat(user, 'group', groupId);
    if (!ctx.canModerate) throw new ForbiddenException('Apenas a moderação do grupo muda o tópico');
    const res = await this.send(user, 'group', groupId, { content: topic }, undefined, { ctx, messageType: 'topic_change', metadata: { topic }, notifyType: NotificationType.STUDY_GROUP_TOPIC_CHANGED });
    return res;
  }

  async unreadTotal(userId: string) {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM messages m
      JOIN participants p ON p."contextType" = 'conversation' AND p."contextId" = m."contextId" AND p."userId" = ${userId}::uuid
      WHERE m."contextType" = 'conversation' AND m."senderId" IS DISTINCT FROM ${userId}::uuid AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`;
    return { success: true, data: { unread: row?.n ?? 0 } };
  }
}
