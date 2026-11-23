import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto, paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationSettingsDto, CreateMessageRequestDto, ListRequestsQueryDto, StartConversationDto } from './dto/message.dto';
import { MessagesService, shapeMessage } from './messages.service';

const USER_MIN = { userId: true, username: true, avatarUrl: true, role: true } as const;
const MAX_REQUESTS_PER_DAY = 5;

interface Prefs { acceptsMessagesFromStudents?: boolean; acceptsMessagesFromAll?: boolean; courseRelatedOnly?: boolean; dailyMessageLimit?: number; allowAttachments?: boolean }

@Injectable()
export class DirectMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Regras de quem pode escrever a quem ───────────────────────────────────

  private async receiverOrThrow(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { userId }, select: { userId: true, role: true, status: true, username: true, messagePreferences: true } });
    if (!u || u.status !== 'approved') throw new NotFoundException('Utilizador não encontrado');
    return u;
  }

  /** Há curso de um dos dois em que o outro está matriculado? */
  private async courseRelated(a: string, b: string) {
    const hit = await this.prisma.enrollment.findFirst({
      where: { OR: [{ userId: a, course: { instructorId: b } }, { userId: b, course: { instructorId: a } }] }, select: { enrollmentId: true },
    });
    return !!hit;
  }

  /**
   * Pode `sender` iniciar conversa com `receiver` sem pedido?
   * admin: sempre · receptor aceita todos · professor↔aluno do seu curso (o aluno só se o professor aceitar alunos) ·
   * aluno sem curso em comum só se o receptor aceitar alunos e não for "só relacionado com cursos".
   */
  async mayStartDirectly(sender: AuthUser, receiver: { userId: string; messagePreferences: Prisma.JsonValue }) {
    if (sender.role === 'admin') return true;
    const prefs = (receiver.messagePreferences ?? {}) as Prefs;
    if (prefs.acceptsMessagesFromAll) return true;
    const related = await this.courseRelated(sender.userId, receiver.userId);
    // quem lecciona o curso pode escrever aos seus alunos
    if (related && (await this.prisma.course.findFirst({ where: { instructorId: sender.userId, enrollments: { some: { userId: receiver.userId } } }, select: { courseId: true } }))) return true;
    if (sender.role === 'student' && prefs.acceptsMessagesFromStudents) return related || prefs.courseRelatedOnly === false;
    return false;
  }

  private async existingConversation(db: Prisma.TransactionClient | PrismaService, a: string, b: string) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT p1."contextId" AS id FROM participants p1
      JOIN participants p2 ON p2."contextType" = 'conversation' AND p2."contextId" = p1."contextId" AND p2."userId" = ${b}::uuid
      JOIN conversations c ON c."conversationId" = p1."contextId" AND c."isActive"
      WHERE p1."contextType" = 'conversation' AND p1."userId" = ${a}::uuid LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  /** Limite diário do destinatário para quem lhe escreve sem resposta (preferência `dailyMessageLimit`). */
  private async enforceReceiverLimit(tx: Prisma.TransactionClient, sender: AuthUser, conversationId: string | null, receiver: { userId: string; messagePreferences: Prisma.JsonValue }) {
    if (sender.role === 'admin' || !conversationId) return;
    const limit = ((receiver.messagePreferences ?? {}) as Prefs).dailyMessageLimit;
    if (!limit || limit <= 0) return;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const lastReply = await tx.message.findFirst({ where: { contextType: 'conversation', contextId: conversationId, senderId: receiver.userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    const since = lastReply && lastReply.createdAt > startOfDay ? lastReply.createdAt : startOfDay;
    const sent = await tx.message.count({ where: { contextType: 'conversation', contextId: conversationId, senderId: sender.userId, createdAt: { gt: since } } });
    if (sent >= limit) throw new HttpException({ message: `Este utilizador aceita no máximo ${limit} mensagens por dia sem resposta`, code: 'RECEIVER_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
  }

  // ── Conversas ─────────────────────────────────────────────────────────────

  /** Inicia (ou reutiliza) a conversa 1:1 e envia a 1.ª mensagem. */
  async start(user: AuthUser, dto: StartConversationDto) {
    if (dto.userId === user.userId) throw new BadRequestException('Não pode conversar consigo próprio');
    const receiver = await this.receiverOrThrow(dto.userId);
    let existing = await this.existingConversation(this.prisma, user.userId, dto.userId);
    if (!existing && !(await this.mayStartDirectly(user, receiver))) {
      throw new HttpException({ message: 'Este utilizador não aceita mensagens directas. Envie um pedido de mensagem.', code: 'MESSAGE_REQUEST_REQUIRED' }, HttpStatus.FORBIDDEN);
    }
    const conversationId = await this.prisma.$transaction(async (tx) => {
      // serializa a criação do mesmo par para não haver conversas duplicadas
      const [a, b] = [user.userId, dto.userId].sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a + b}))`;
      existing = await this.existingConversation(tx, user.userId, dto.userId);
      if (existing) return existing;
      const c = await tx.conversation.create({ data: { type: 'conversation', creatorId: user.userId, stats: { messageCount: 0, participantCount: 2, lastActivity: null } } });
      await tx.participant.createMany({ data: [user.userId, dto.userId].map((userId) => ({ userId, contextType: 'conversation' as const, contextId: c.conversationId, role: 'participant' as const })) });
      return c.conversationId;
    }, { timeout: 10_000 });
    const sent = await this.messages.send(user, 'conversation', conversationId, { content: dto.content }, undefined, {
      beforeSend: (tx) => this.enforceReceiverLimit(tx, user, conversationId, receiver),
    });
    return { success: true, data: { conversationId, message: sent.data } };
  }

  /** Envio numa conversa existente (aplica o limite do destinatário). */
  async sendInConversation(user: AuthUser, conversationId: string, content: string | undefined, replyToId: string | undefined, file?: Express.Multer.File) {
    const ctx = await this.messages.chat(user, 'conversation', conversationId);
    const otherId = (await ctx.members()).find((u) => u !== user.userId);
    const receiver = otherId ? await this.prisma.user.findUnique({ where: { userId: otherId }, select: { userId: true, messagePreferences: true, status: true } }) : null;
    if (!receiver || receiver.status !== 'approved') throw new ForbiddenException('O outro participante já não está disponível');
    return this.messages.send(user, 'conversation', conversationId, { content, replyToId }, file, { ctx, beforeSend: (tx) => this.enforceReceiverLimit(tx, user, conversationId, receiver) });
  }

  async list(user: AuthUser, q: PaginationQueryDto) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p."contextId" AS id FROM participants p JOIN conversations c ON c."conversationId" = p."contextId" AND c."isActive"
      WHERE p."contextType" = 'conversation' AND p."userId" = ${user.userId}::uuid
      ORDER BY COALESCE(c."lastMessageAt", c."createdAt") DESC LIMIT ${q.limit} OFFSET ${skipOf(q)}`;
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM participants p JOIN conversations c ON c."conversationId" = p."contextId" AND c."isActive"
      WHERE p."contextType" = 'conversation' AND p."userId" = ${user.userId}::uuid`;
    const ids = rows.map((r) => r.id);
    if (!ids.length) return paginated([], n, q);
    const [others, mine, last, unread] = await Promise.all([
      this.prisma.participant.findMany({ where: { contextType: 'conversation', contextId: { in: ids }, userId: { not: user.userId } }, include: { user: { select: USER_MIN } } }),
      this.prisma.participant.findMany({ where: { contextType: 'conversation', contextId: { in: ids }, userId: user.userId } }),
      this.prisma.$queryRaw<{ id: string }[]>`SELECT DISTINCT ON ("contextId") "messageId" AS id FROM messages WHERE "contextType" = 'conversation' AND "contextId" = ANY(${ids}::uuid[]) ORDER BY "contextId", "createdAt" DESC`,
      this.prisma.$queryRaw<{ cid: string; n: number }[]>`
        SELECT m."contextId" AS cid, COUNT(*)::int AS n FROM messages m
        JOIN participants p ON p."contextType" = 'conversation' AND p."contextId" = m."contextId" AND p."userId" = ${user.userId}::uuid
        WHERE m."contextType" = 'conversation' AND m."contextId" = ANY(${ids}::uuid[]) AND m."senderId" IS DISTINCT FROM ${user.userId}::uuid AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
        GROUP BY 1`,
    ]);
    const lastMsgs = await this.prisma.message.findMany({ where: { messageId: { in: last.map((l) => l.id) } }, include: { sender: { select: USER_MIN }, replyTo: { select: { messageId: true, content: true, sender: { select: USER_MIN } } } } });
    const data = ids.map((id) => {
      const lm = lastMsgs.find((m) => m.contextId === id);
      const me = mine.find((p) => p.contextId === id);
      return {
        conversationId: id,
        participant: others.find((p) => p.contextId === id)?.user ?? null,
        lastMessage: lm ? shapeMessage(lm) : null,
        unreadCount: unread.find((u) => u.cid === id)?.n ?? 0,
        muted: !!me && (me.muted || (!!me.mutedUntil && me.mutedUntil > new Date())), notifications: me?.notifications ?? true,
      };
    });
    return paginated(data, n, q);
  }

  async detail(user: AuthUser, conversationId: string) {
    await this.messages.chat(user, 'conversation', conversationId);
    const [c, other, me] = await Promise.all([
      this.prisma.conversation.findUniqueOrThrow({ where: { conversationId }, select: { conversationId: true, createdAt: true, lastMessageAt: true, stats: true } }),
      this.prisma.participant.findFirst({ where: { contextType: 'conversation', contextId: conversationId, userId: { not: user.userId } }, include: { user: { select: USER_MIN } } }),
      this.prisma.participant.findFirst({ where: { contextType: 'conversation', contextId: conversationId, userId: user.userId } }),
    ]);
    return { success: true, data: { ...c, participant: other?.user ?? null, lastReadAt: me?.lastReadAt ?? null, muted: me?.muted ?? false, mutedUntil: me?.mutedUntil ?? null, notifications: me?.notifications ?? true } };
  }

  async settings(user: AuthUser, conversationId: string, dto: ConversationSettingsDto) {
    await this.messages.chat(user, 'conversation', conversationId);
    const data: Prisma.ParticipantUpdateInput = {
      ...(dto.notifications !== undefined && { notifications: dto.notifications }),
      ...(dto.muteMinutes ? { muted: false, mutedUntil: new Date(Date.now() + dto.muteMinutes * 60_000) } : dto.muted !== undefined ? { muted: dto.muted, mutedUntil: null } : {}),
    };
    const p = await this.prisma.participant.update({ where: { contextType_contextId_userId: { contextType: 'conversation', contextId: conversationId, userId: user.userId } }, data });
    return { success: true, data: { notifications: p.notifications, muted: p.muted, mutedUntil: p.mutedUntil } };
  }

  // ── Pedidos de mensagem ───────────────────────────────────────────────────

  async createRequest(user: AuthUser, dto: CreateMessageRequestDto) {
    if (dto.receiverId === user.userId) throw new BadRequestException('Não pode enviar um pedido a si próprio');
    const receiver = await this.receiverOrThrow(dto.receiverId);
    if (await this.existingConversation(this.prisma, user.userId, dto.receiverId)) throw new ConflictException('Já tem uma conversa com este utilizador');
    if (await this.mayStartDirectly(user, receiver)) throw new HttpException({ message: 'Este utilizador aceita mensagens directas: inicie a conversa', code: 'DIRECT_ALLOWED' }, HttpStatus.BAD_REQUEST);
    const req = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.userId + dto.receiverId + 'req'}))`;
      if (await tx.messageRequest.findFirst({ where: { senderId: user.userId, receiverId: dto.receiverId, status: 'pending' } })) throw new ConflictException('Já tem um pedido pendente para este utilizador');
      const recent = await tx.messageRequest.count({ where: { senderId: user.userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
      if (recent >= MAX_REQUESTS_PER_DAY) throw new HttpException({ message: 'Limite diário de pedidos atingido', code: 'DAILY_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
      return tx.messageRequest.create({ data: { senderId: user.userId, receiverId: dto.receiverId, subject: dto.subject, message: dto.message } });
    });
    await this.notifications.notify(dto.receiverId, NotificationType.NEW_CONVERSATION, { title: 'Novo pedido de mensagem', message: `Recebeu um pedido de mensagem: ${dto.subject}`, relatedEntityId: req.requestId });
    return { success: true, data: req };
  }

  async listRequests(user: AuthUser, q: ListRequestsQueryDto) {
    const sent = q.box === 'sent';
    const where: Prisma.MessageRequestWhereInput = { [sent ? 'senderId' : 'receiverId']: user.userId, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      this.prisma.messageRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, include: { sender: { select: USER_MIN }, receiver: { select: USER_MIN } } }),
      this.prisma.messageRequest.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  /** O destinatário aprova (cria a conversa com a mensagem do pedido) ou rejeita. */
  async review(user: AuthUser, requestId: string, approve: boolean) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM message_requests WHERE "requestId" = ${requestId}::uuid FOR UPDATE`;
      const r = await tx.messageRequest.findFirst({ where: { requestId, receiverId: user.userId } });
      if (!r) throw new NotFoundException('Pedido não encontrado');
      if (r.status !== 'pending') throw new ConflictException('Este pedido já foi tratado');
      if (!approve) { await tx.messageRequest.update({ where: { requestId }, data: { status: 'rejected' } }); return { r, conversationId: null }; }
      const [a, b] = [r.senderId, r.receiverId].sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a + b}))`;
      let conversationId = await this.existingConversation(tx, r.senderId, r.receiverId);
      if (!conversationId) {
        const c = await tx.conversation.create({ data: { type: 'conversation', creatorId: r.senderId, stats: { messageCount: 1, participantCount: 2, lastActivity: new Date().toISOString() } } });
        conversationId = c.conversationId;
        await tx.participant.createMany({ data: [r.senderId, r.receiverId].map((userId) => ({ userId, contextType: 'conversation' as const, contextId: c.conversationId })) });
      }
      const m = await tx.message.create({ data: { senderId: r.senderId, content: r.message, contextType: 'conversation', contextId: conversationId, metadata: { subject: r.subject, requestId } } });
      await tx.conversation.update({ where: { conversationId }, data: { lastMessageAt: m.createdAt } });
      await tx.participant.update({ where: { contextType_contextId_userId: { contextType: 'conversation', contextId: conversationId, userId: r.senderId } }, data: { lastReadAt: m.createdAt, messageCount: { increment: 1 } } });
      await tx.messageRequest.update({ where: { requestId }, data: { status: 'approved' } });
      return { r, conversationId };
    });
    await this.notifications.notify(result.r.senderId, NotificationType.NEW_CONVERSATION, {
      title: approve ? 'Pedido de mensagem aceite' : 'Pedido de mensagem recusado',
      message: approve ? `O seu pedido "${result.r.subject}" foi aceite. Já pode conversar.` : `O seu pedido "${result.r.subject}" foi recusado.`, relatedEntityId: result.conversationId ?? requestId,
    });
    return { success: true, data: { requestId, status: approve ? 'approved' : 'rejected', conversationId: result.conversationId } };
  }

  async cancelRequest(user: AuthUser, requestId: string) {
    const r = await this.prisma.messageRequest.findFirst({ where: { requestId, senderId: user.userId } });
    if (!r) throw new NotFoundException('Pedido não encontrado');
    if (r.status !== 'pending') throw new ConflictException('Só se cancelam pedidos pendentes');
    await this.prisma.messageRequest.delete({ where: { requestId } });
    return { success: true, message: 'Pedido cancelado' };
  }
}
