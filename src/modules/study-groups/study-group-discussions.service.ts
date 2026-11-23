import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, ActivityType, NotificationType, Prisma, VoteType } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto, paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto, ListRepliesQueryDto, ListTopicsQueryDto, ReplyDto, ReportTopicDto, UpdateTopicDto } from './dto/group-work.dto';
import { GroupCtx, groupContext, requireMember } from './study-group-access';
import { POINTS, award } from './study-group-score';
import { StudyGroupsService } from './study-groups.service';

const USER_MIN = { userId: true, username: true, avatarUrl: true } as const;
const norm = (tags?: string[]) => (tags ? [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] : undefined);
const excerpt = (s: string) => (s.length > 200 ? `${s.slice(0, 197)}...` : s);

@Injectable()
export class StudyGroupDiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: StudyGroupsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  private async topic(groupId: string, topicId: string) {
    const t = await this.prisma.discussionTopic.findFirst({ where: { topicId, groupId } });
    if (!t) throw new NotFoundException('Tópico não encontrado');
    return t;
  }

  private async reply(topicId: string, replyId: string) {
    const r = await this.prisma.discussionReply.findFirst({ where: { replyId, topicId } });
    if (!r) throw new NotFoundException('Resposta não encontrada');
    return r;
  }

  private requireWriter(ctx: GroupCtx) {
    if (!ctx.canWrite) throw new ForbiddenException('Apenas membros activos podem participar nas discussões');
    if (ctx.group.status !== 'active') throw new BadRequestException('O grupo não está activo');
  }

  // ── Tópicos ──────────────────────────────────────────────────────────────

  async list(user: AuthUser, groupId: string, q: ListTopicsQueryDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const where: Prisma.DiscussionTopicWhereInput = {
      groupId,
      ...(q.tag && { tags: { has: q.tag.trim().toLowerCase() } }),
      ...(q.solved !== undefined && { replies: q.solved ? { some: { isSolution: true } } : { none: { isSolution: true } } }),
      ...(q.search && { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { content: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const orderBy: Prisma.DiscussionTopicOrderByWithRelationInput[] = [
      { isPinned: 'desc' },
      q.sort === 'replies' ? { replies: { _count: 'desc' } } : q.sort === 'activity' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.discussionTopic.findMany({
        where, orderBy, skip: skipOf(q), take: q.limit,
        include: { author: { select: USER_MIN }, _count: { select: { replies: true } }, replies: { where: { isSolution: true }, select: { replyId: true }, take: 1 } },
      }),
      this.prisma.discussionTopic.count({ where }),
    ]);
    return paginated(rows.map(({ content, replies, _count, flags, ...t }) => ({ ...t, excerpt: excerpt(content), repliesCount: _count.replies, solved: replies.length > 0, ...(ctx.canModerate && { flags }) })), total, q);
  }

  async detail(user: AuthUser, groupId: string, topicId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    await this.topic(groupId, topicId);
    const { flags, ...t } = await this.prisma.discussionTopic.findUniqueOrThrow({
      where: { topicId }, include: { author: { select: USER_MIN }, _count: { select: { replies: true } }, replies: { where: { isSolution: true }, select: { replyId: true }, take: 1 } },
    });
    const { replies, _count, ...rest } = t;
    return { success: true, data: { ...rest, repliesCount: _count.replies, solved: replies.length > 0, solutionReplyId: replies[0]?.replyId ?? null, ...(ctx.canModerate && { flags }) } };
  }

  async create(user: AuthUser, groupId: string, dto: CreateTopicDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireWriter(ctx);
    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.discussionTopic.create({ data: { groupId, authorId: user.userId, title: dto.title, content: dto.content, tags: norm(dto.tags) ?? [] }, include: { author: { select: USER_MIN } } });
      await award(tx, groupId, user.userId, POINTS.topic);
      return t;
    });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.discussion_started, entityType: ActivityEntityType.discussion_topic, entityId: created.topicId, metadata: { title: created.title } });
    await this.groups.notifyMembers(groupId, user.userId, NotificationType.DISCUSSION_TOPIC_CREATED, 'Novo tópico', `Novo tópico no grupo "${ctx.group.name}": ${created.title}`);
    return { success: true, data: created };
  }

  async update(user: AuthUser, groupId: string, topicId: string, dto: UpdateTopicDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const t = await this.topic(groupId, topicId);
    const isAuthor = t.authorId === user.userId;
    const { isPinned, isClosed, tags, ...text } = dto;
    const touchesContent = text.title !== undefined || text.content !== undefined || tags !== undefined;
    if ((isPinned !== undefined || isClosed !== undefined) && !ctx.canModerate) throw new ForbiddenException('Apenas a moderação fixa ou fecha tópicos');
    if (touchesContent) {
      if (!(isAuthor && ctx.canWrite) && !ctx.canModerate) throw new ForbiddenException('Sem permissão para editar este tópico');
      if (t.isClosed && !ctx.canModerate) throw new BadRequestException('Tópico fechado');
    }
    const updated = await this.prisma.discussionTopic.update({ where: { topicId }, data: { ...text, ...(tags !== undefined && { tags: norm(tags) }), ...(isPinned !== undefined && { isPinned }), ...(isClosed !== undefined && { isClosed }) } });
    if (!isAuthor) {
      await this.notifications.notify(t.authorId, NotificationType.DISCUSSION_TOPIC_UPDATED, { title: 'Tópico actualizado', message: `O seu tópico "${updated.title}" foi alterado pela moderação.`, relatedEntityId: topicId });
    }
    const { flags, ...out } = updated;
    return { success: true, data: { ...out, ...(ctx.canModerate && { flags }) } };
  }

  async remove(user: AuthUser, groupId: string, topicId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const t = await this.topic(groupId, topicId);
    if (!(t.authorId === user.userId && ctx.isMember) && !ctx.canModerate) throw new ForbiddenException('Sem permissão para apagar este tópico');
    await this.prisma.$transaction(async (tx) => {
      // devolve pontos do tópico e de todas as respostas / soluções
      const replies = await tx.discussionReply.findMany({ where: { topicId }, select: { authorId: true, isSolution: true } });
      await award(tx, groupId, t.authorId, -POINTS.topic);
      for (const r of replies) await award(tx, groupId, r.authorId, -(POINTS.reply + (r.isSolution ? POINTS.solution : 0)));
      await tx.discussionTopic.delete({ where: { topicId } });
    });
    return { success: true, message: 'Tópico apagado' };
  }

  // ── Respostas ────────────────────────────────────────────────────────────

  async listReplies(user: AuthUser, groupId: string, topicId: string, q: ListRepliesQueryDto) {
    requireMember(await groupContext(this.prisma, groupId, user));
    await this.topic(groupId, topicId);
    const where = { topicId };
    const [rows, total] = await Promise.all([
      this.prisma.discussionReply.findMany({
        where, orderBy: q.sort === 'top' ? [{ isSolution: 'desc' }, { upvotes: 'desc' }, { createdAt: 'asc' }] : [{ createdAt: 'asc' }], skip: skipOf(q), take: q.limit,
        include: { author: { select: USER_MIN }, votes: { where: { userId: user.userId }, select: { voteType: true } } },
      }),
      this.prisma.discussionReply.count({ where }),
    ]);
    return paginated(rows.map(({ votes, ...r }) => ({ ...r, myVote: votes[0]?.voteType ?? null })), total, q);
  }

  async addReply(user: AuthUser, groupId: string, topicId: string, dto: ReplyDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireWriter(ctx);
    const t = await this.topic(groupId, topicId);
    if (t.isClosed) throw new BadRequestException('Tópico fechado');
    const r = await this.prisma.$transaction(async (tx) => {
      const created = await tx.discussionReply.create({ data: { topicId, authorId: user.userId, content: dto.content }, include: { author: { select: USER_MIN } } });
      await tx.discussionTopic.update({ where: { topicId }, data: { updatedAt: new Date() } });
      await award(tx, groupId, user.userId, POINTS.reply);
      return created;
    });
    if (t.authorId !== user.userId) {
      await this.notifications.notify(t.authorId, NotificationType.DISCUSSION_REPLY_ADDED, { title: 'Nova resposta', message: `Responderam ao seu tópico "${t.title}".`, relatedEntityId: topicId });
    }
    return { success: true, data: { ...r, myVote: null } };
  }

  async updateReply(user: AuthUser, groupId: string, topicId: string, replyId: string, dto: ReplyDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const t = await this.topic(groupId, topicId);
    const r = await this.reply(topicId, replyId);
    if (r.authorId !== user.userId || !ctx.canWrite) throw new ForbiddenException('Só o autor edita a sua resposta');
    if (t.isClosed) throw new BadRequestException('Tópico fechado');
    const updated = await this.prisma.discussionReply.update({ where: { replyId }, data: { content: dto.content } });
    return { success: true, data: updated };
  }

  async removeReply(user: AuthUser, groupId: string, topicId: string, replyId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    await this.topic(groupId, topicId);
    const r = await this.reply(topicId, replyId);
    if (!(r.authorId === user.userId && ctx.isMember) && !ctx.canModerate) throw new ForbiddenException('Sem permissão para apagar esta resposta');
    await this.prisma.$transaction(async (tx) => {
      await tx.discussionReply.delete({ where: { replyId } });
      await award(tx, groupId, r.authorId, -(POINTS.reply + (r.isSolution ? POINTS.solution : 0)));
    });
    return { success: true, message: 'Resposta apagada' };
  }

  /** Voto idempotente (um por utilizador). `upvotes` guarda o saldo (positivos − negativos). */
  async vote(user: AuthUser, groupId: string, topicId: string, replyId: string, voteType: VoteType) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireWriter(ctx);
    await this.topic(groupId, topicId);
    const reply = await this.reply(topicId, replyId);
    if (reply.authorId === user.userId) throw new BadRequestException('Não pode votar na sua própria resposta');
    const { score, isNew } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM discussion_replies WHERE "replyId" = ${replyId}::uuid FOR UPDATE`;
      const prev = await tx.replyVote.findUnique({ where: { replyId_userId: { replyId, userId: user.userId } } });
      await tx.replyVote.upsert({ where: { replyId_userId: { replyId, userId: user.userId } }, create: { replyId, userId: user.userId, voteType }, update: { voteType } });
      return { score: await this.recomputeScore(tx, replyId), isNew: !prev };
    });
    if (isNew && voteType === 'up') {
      await this.notifications.notify(reply.authorId, NotificationType.DISCUSSION_REPLY_VOTED, { title: 'Voto na sua resposta', message: 'A sua resposta recebeu um voto positivo.', relatedEntityId: topicId });
    }
    return { success: true, data: { replyId, upvotes: score, myVote: voteType } };
  }

  async removeVote(user: AuthUser, groupId: string, topicId: string, replyId: string) {
    requireMember(await groupContext(this.prisma, groupId, user));
    await this.topic(groupId, topicId);
    await this.reply(topicId, replyId);
    const score = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM discussion_replies WHERE "replyId" = ${replyId}::uuid FOR UPDATE`;
      await tx.replyVote.deleteMany({ where: { replyId, userId: user.userId } });
      return this.recomputeScore(tx, replyId);
    });
    return { success: true, data: { replyId, upvotes: score, myVote: null } };
  }

  private async recomputeScore(tx: Prisma.TransactionClient, replyId: string) {
    const [up, down] = await Promise.all([
      tx.replyVote.count({ where: { replyId, voteType: 'up' } }),
      tx.replyVote.count({ where: { replyId, voteType: 'down' } }),
    ]);
    await tx.discussionReply.update({ where: { replyId }, data: { upvotes: up - down } });
    return up - down;
  }

  /** Marca a resposta como solução (autor do tópico ou moderação); só existe uma por tópico. */
  async setSolution(user: AuthUser, groupId: string, topicId: string, replyId: string, solved: boolean) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const t = await this.topic(groupId, topicId);
    if (!ctx.canModerate && !(t.authorId === user.userId && ctx.canWrite)) throw new ForbiddenException('Só o autor do tópico ou a moderação escolhem a solução');
    await this.reply(topicId, replyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM discussion_topics WHERE "topicId" = ${topicId}::uuid FOR UPDATE`;
      const current = await tx.discussionReply.findMany({ where: { topicId, isSolution: true }, select: { replyId: true, authorId: true } });
      const already = current.some((c) => c.replyId === replyId);
      if (solved === already) return;
      for (const c of current) { await tx.discussionReply.update({ where: { replyId: c.replyId }, data: { isSolution: false } }); await award(tx, groupId, c.authorId, -POINTS.solution); }
      if (solved) {
        const r = await tx.discussionReply.update({ where: { replyId }, data: { isSolution: true } });
        await award(tx, groupId, r.authorId, POINTS.solution);
      }
    });
    return { success: true, data: { replyId, isSolution: solved } };
  }

  // ── Denúncias ────────────────────────────────────────────────────────────

  async report(user: AuthUser, groupId: string, topicId: string, dto: ReportTopicDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const t = await this.topic(groupId, topicId);
    if (t.authorId === user.userId) throw new BadRequestException('Não pode denunciar o seu próprio tópico');
    const flags = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM discussion_topics WHERE "topicId" = ${topicId}::uuid FOR UPDATE`;
      if (await tx.contentReport.findFirst({ where: { topicId, reporterId: user.userId, resolved: false } })) throw new ConflictException('Já denunciou este tópico');
      await tx.contentReport.create({ data: { topicId, reporterId: user.userId, reason: dto.reason } });
      const n = await tx.contentReport.count({ where: { topicId, resolved: false } });
      await tx.discussionTopic.update({ where: { topicId }, data: { flags: n } });
      return n;
    });
    const staff = await this.prisma.studyGroupMember.findMany({ where: { groupId, status: 'active', role: { in: ['leader', 'co_leader', 'moderator'] }, userId: { not: user.userId } }, select: { userId: true } });
    await this.notifications.notifyMany(staff.map((s) => s.userId), NotificationType.STUDY_GROUP_MESSAGE_OFF_TOPIC, { title: 'Tópico denunciado', message: `O tópico "${t.title}" foi denunciado (${dto.reason}).`, relatedEntityId: topicId });
    return { success: true, message: 'Denúncia registada', data: { flags } };
  }

  async listReports(user: AuthUser, groupId: string, q: PaginationQueryDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canModerate) throw new ForbiddenException('Acesso restrito à moderação');
    const where: Prisma.ContentReportWhereInput = { resolved: false, topic: { groupId } };
    const [rows, total] = await Promise.all([
      this.prisma.contentReport.findMany({ where, orderBy: { createdAt: 'asc' }, skip: skipOf(q), take: q.limit, include: { reporter: { select: USER_MIN }, topic: { select: { topicId: true, title: true, authorId: true } } } }),
      this.prisma.contentReport.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async resolveReport(user: AuthUser, groupId: string, reportId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canModerate) throw new ForbiddenException('Acesso restrito à moderação');
    const r = await this.prisma.contentReport.findFirst({ where: { reportId, topic: { groupId } } });
    if (!r || !r.topicId) throw new NotFoundException('Denúncia não encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.contentReport.update({ where: { reportId }, data: { resolved: true } });
      await tx.discussionTopic.update({ where: { topicId: r.topicId! }, data: { flags: await tx.contentReport.count({ where: { topicId: r.topicId, resolved: false } }) } });
    });
    return { success: true, message: 'Denúncia resolvida' };
  }
}
