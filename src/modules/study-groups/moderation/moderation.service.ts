import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModerationActionType as AT, NotificationType, Prisma, ScanContentType, ScanStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { StudyGroupContentsService } from '../study-group-contents.service';
import { StudyGroupDiscussionsService } from '../study-group-discussions.service';
import { GroupCtx, effectiveStatus, groupContext, rankOfRole } from '../study-group-access';
import { CreateAppealDto, DecideAppealDto, ListActionsQueryDto, ListAppealsQueryDto, ListScansQueryDto, MODERATOR_MAX_MUTE_MINUTES, MuteDto, ReasonedActionDto, ReverseDto, ReviewScanDto, ScanDto } from './moderation.dto';
import { THRESHOLDS, scoreText } from './content-scan';

const PERSON = { userId: true, username: true, fullName: true, avatarUrl: true } as const;
const WARN_WINDOW_DAYS = 30;
const WARN_ESCALATION = 3; // de 3 em 3 avisos na janela: silenciamento automático
const AUTO_MUTE_MINUTES = 1_440;
const SCAN_LIMIT = 500;
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class ModerationService {
  private readonly log = new Logger(ModerationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly discussions: StudyGroupDiscussionsService,
    private readonly contents: StudyGroupContentsService,
  ) {}

  // ── Regras ───────────────────────────────────────────────────────────────

  private async modCtx(user: AuthUser, groupId: string, needManage = false) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!(needManage ? ctx.canManage : ctx.canModerate)) throw new ForbiddenException(needManage ? 'Apenas co-líderes e o líder podem fazer isto' : 'Apenas a liderança do grupo pode fazer isto');
    return ctx;
  }

  /** O alvo é membro, não é o próprio, nem o líder, e tem cargo estritamente inferior. */
  private async targetOf(ctx: GroupCtx, user: AuthUser, targetId: string) {
    if (targetId === user.userId) throw new BadRequestException({ message: 'Não pode aplicar moderação a si próprio', code: 'SELF_MODERATION' });
    const t = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: ctx.group.groupId, userId: targetId } } });
    if (!t || t.status === 'left') throw new NotFoundException({ message: 'Membro não encontrado', code: 'MEMBER_NOT_FOUND' });
    if (t.role === 'leader') throw new ForbiddenException({ message: 'Não é possível moderar o líder', code: 'HIERARCHY' });
    if (ctx.rank <= rankOfRole(t.role)) throw new ForbiddenException({ message: 'Não pode moderar um membro do mesmo nível ou superior', code: 'HIERARCHY' });
    return t;
  }

  private notice(userId: string, groupName: string, groupId: string, title: string, message: string, type: NotificationType = NotificationType.MODERATION_NOTICE) {
    void this.notifications.notify(userId, type, { title, message: `${message} (grupo "${groupName}")`.slice(0, 500), relatedEntityId: groupId });
  }

  /** Regista no histórico e revoga a medida anterior quando se desfaz. Nunca lança (usado também pelo PATCH de membros). */
  async record(groupId: string, targetId: string, moderatorId: string | null, type: AT, reason: string, extra: { durationMinutes?: number; expiresAt?: Date | null; contentType?: ScanContentType; contentId?: string } = {}, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    try {
      if (type === AT.unmute || type === AT.unban) {
        await db.groupModerationAction.updateMany({ where: { groupId, targetId, type: type === AT.unmute ? AT.mute : AT.ban, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return await db.groupModerationAction.create({ data: { groupId, targetId, moderatorId, type, reason, ...extra } });
    } catch (e) {
      this.log.error(`Falha ao registar acção de moderação: ${(e as Error).message}`);
      return null;
    }
  }

  // ── Acções ───────────────────────────────────────────────────────────────

  async warn(user: AuthUser, groupId: string, dto: ReasonedActionDto) {
    const ctx = await this.modCtx(user, groupId);
    const t = await this.targetOf(ctx, user, dto.userId);
    if (t.status !== 'active' && t.status !== 'muted') throw new ConflictException({ message: 'Só se avisam membros activos', code: 'NOT_ACTIVE' });
    const since = new Date(Date.now() - WARN_WINDOW_DAYS * 86_400_000);
    const { action, escalated } = await this.prisma.$transaction(async (tx) => {
      const action = await tx.groupModerationAction.create({ data: { groupId, targetId: dto.userId, moderatorId: user.userId, type: AT.warn, reason: dto.reason } });
      const n = await tx.groupModerationAction.count({ where: { groupId, targetId: dto.userId, type: AT.warn, revokedAt: null, createdAt: { gte: since } } });
      let escalated = false;
      if (n > 0 && n % WARN_ESCALATION === 0) {
        const expiresAt = new Date(Date.now() + AUTO_MUTE_MINUTES * 60_000);
        const { count } = await tx.studyGroupMember.updateMany({ where: { membershipId: t.membershipId, status: 'active' }, data: { status: 'muted', mutedUntil: expiresAt } });
        if (count) {
          await tx.groupModerationAction.create({ data: { groupId, targetId: dto.userId, moderatorId: null, type: AT.mute, reason: `Silenciamento automático: ${n} avisos em ${WARN_WINDOW_DAYS} dias`, durationMinutes: AUTO_MUTE_MINUTES, expiresAt } });
          escalated = true;
        }
      }
      return { action, escalated };
    });
    this.notice(dto.userId, ctx.group.name, groupId, 'Aviso de moderação', `Recebeu um aviso: ${dto.reason}`, NotificationType.MODERATION_NOTICE);
    if (escalated) this.notice(dto.userId, ctx.group.name, groupId, 'Silenciado automaticamente', 'Atingiu o limite de avisos e foi silenciado por 24 horas.');
    return { success: true, data: { ...action, escalatedToMute: escalated } };
  }

  async mute(user: AuthUser, groupId: string, dto: MuteDto) {
    const ctx = await this.modCtx(user, groupId);
    if (!ctx.canManage && dto.minutes > MODERATOR_MAX_MUTE_MINUTES) throw new ForbiddenException({ message: 'Os moderadores podem silenciar até 24 horas', code: 'MUTE_LIMIT' });
    const t = await this.targetOf(ctx, user, dto.userId);
    if (t.status !== 'active' && t.status !== 'muted') throw new ConflictException({ message: 'Só se silenciam membros activos', code: 'NOT_ACTIVE' });
    const expiresAt = new Date(Date.now() + dto.minutes * 60_000);
    const action = await this.prisma.$transaction(async (tx) => {
      // um novo silenciamento substitui o anterior (que fica revogado no histórico)
      await tx.groupModerationAction.updateMany({ where: { groupId, targetId: dto.userId, type: AT.mute, revokedAt: null }, data: { revokedAt: new Date() } });
      const { count } = await tx.studyGroupMember.updateMany({ where: { membershipId: t.membershipId, status: { in: ['active', 'muted'] } }, data: { status: 'muted', mutedUntil: expiresAt } });
      if (!count) throw new ConflictException({ message: 'O estado do membro mudou entretanto', code: 'STATE_CHANGED' });
      return tx.groupModerationAction.create({ data: { groupId, targetId: dto.userId, moderatorId: user.userId, type: AT.mute, reason: dto.reason, durationMinutes: dto.minutes, expiresAt } });
    });
    this.notice(dto.userId, ctx.group.name, groupId, 'Silenciado no grupo', `Foi silenciado por ${dto.minutes} minutos: ${dto.reason}`);
    return { success: true, data: action };
  }

  async unmute(user: AuthUser, groupId: string, dto: ReverseDto) {
    const ctx = await this.modCtx(user, groupId);
    const t = await this.targetOf(ctx, user, dto.userId);
    if (effectiveStatus(t) !== 'muted') throw new ConflictException({ message: 'O membro não está silenciado', code: 'NOT_MUTED' });
    const action = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studyGroupMember.updateMany({ where: { membershipId: t.membershipId, status: 'muted' }, data: { status: 'active', mutedUntil: null } });
      if (!count) throw new ConflictException({ message: 'O membro não está silenciado', code: 'NOT_MUTED' });
      return this.record(groupId, dto.userId, user.userId, AT.unmute, dto.reason ?? 'Silenciamento levantado', {}, tx);
    });
    this.notice(dto.userId, ctx.group.name, groupId, 'Silenciamento levantado', 'Já pode voltar a participar.');
    return { success: true, data: action };
  }

  async ban(user: AuthUser, groupId: string, dto: ReasonedActionDto) {
    const ctx = await this.modCtx(user, groupId, true);
    const t = await this.targetOf(ctx, user, dto.userId);
    if (t.status !== 'active' && t.status !== 'muted') throw new ConflictException({ message: 'Só se banem membros activos', code: 'NOT_ACTIVE' });
    const action = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studyGroupMember.updateMany({ where: { membershipId: t.membershipId, status: { in: ['active', 'muted'] } }, data: { status: 'banned', previousRole: t.role, role: 'member', mutedUntil: null } });
      if (!count) throw new ConflictException({ message: 'O estado do membro mudou entretanto', code: 'STATE_CHANGED' });
      await tx.groupModerationAction.updateMany({ where: { groupId, targetId: dto.userId, type: AT.mute, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.groupModerationAction.create({ data: { groupId, targetId: dto.userId, moderatorId: user.userId, type: AT.ban, reason: dto.reason } });
    });
    this.notice(dto.userId, ctx.group.name, groupId, 'Banido do grupo', `Foi banido: ${dto.reason}. Pode apresentar um recurso.`);
    return { success: true, data: action };
  }

  async unban(user: AuthUser, groupId: string, dto: ReverseDto) {
    const ctx = await this.modCtx(user, groupId, true);
    const t = await this.targetOf(ctx, user, dto.userId);
    if (t.status !== 'banned') throw new ConflictException({ message: 'O membro não está banido', code: 'NOT_BANNED' });
    const action = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studyGroupMember.updateMany({ where: { membershipId: t.membershipId, status: 'banned' }, data: { status: 'active', mutedUntil: null } });
      if (!count) throw new ConflictException({ message: 'O membro não está banido', code: 'NOT_BANNED' });
      return this.record(groupId, dto.userId, user.userId, AT.unban, dto.reason ?? 'Banimento levantado', {}, tx);
    });
    this.notice(dto.userId, ctx.group.name, groupId, 'Banimento levantado', 'Voltou a ser membro activo.');
    return { success: true, data: action };
  }

  // ── Histórico ────────────────────────────────────────────────────────────

  async actions(user: AuthUser, groupId: string, q: ListActionsQueryDto) {
    await this.modCtx(user, groupId);
    const where: Prisma.GroupModerationActionWhereInput = { groupId, ...(q.type && { type: q.type }), ...(q.userId && { targetId: q.userId }) };
    const [rows, total] = await Promise.all([
      this.prisma.groupModerationAction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, include: { target: { select: PERSON }, moderator: { select: PERSON } } }),
      this.prisma.groupModerationAction.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  /** O próprio membro vê as medidas que lhe foram aplicadas e o estado do respectivo recurso. */
  async mine(user: AuthUser, groupId: string) {
    await groupContext(this.prisma, groupId, user);
    const rows = await this.prisma.groupModerationAction.findMany({
      where: { groupId, targetId: user.userId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { actionId: true, type: true, reason: true, durationMinutes: true, expiresAt: true, revokedAt: true, createdAt: true, appeal: { select: { appealId: true, status: true, decisionNote: true, decidedAt: true } } },
    });
    const now = new Date();
    return { success: true, data: rows.map((a) => ({ ...a, inForce: !a.revokedAt && (a.type === 'ban' || (a.type === 'mute' && (!a.expiresAt || a.expiresAt > now))), appealable: !a.appeal && !a.revokedAt && (a.type === 'ban' || (a.type === 'mute' && (!a.expiresAt || a.expiresAt > now))) })) };
  }

  // ── Análise de conteúdo ──────────────────────────────────────────────────

  async scan(user: AuthUser, groupId: string, dto: ScanDto) {
    await this.modCtx(user, groupId);
    const since = new Date(Date.now() - dto.days * 86_400_000);
    const threshold = THRESHOLDS[dto.sensitivity];
    const inWin = { groupId, createdAt: { gte: since } };
    const [topics, replies, shared] = await Promise.all([
      this.prisma.discussionTopic.findMany({ where: inWin, orderBy: { createdAt: 'desc' }, take: SCAN_LIMIT, select: { topicId: true, authorId: true, title: true, content: true } }),
      this.prisma.discussionReply.findMany({ where: { topic: { groupId }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: SCAN_LIMIT, select: { replyId: true, topicId: true, authorId: true, content: true } }),
      this.prisma.sharedContent.findMany({ where: inWin, orderBy: { createdAt: 'desc' }, take: SCAN_LIMIT, select: { contentId: true, uploaderId: true, title: true, description: true } }),
    ]);
    const items = [
      ...topics.map((t) => ({ type: 'post' as ScanContentType, id: t.topicId, authorId: t.authorId, text: `${t.title}\n${t.content}`, extra: { title: t.title } })),
      ...replies.map((r) => ({ type: 'comment' as ScanContentType, id: r.replyId, authorId: r.authorId, text: r.content, extra: { topicId: r.topicId } })),
      ...shared.map((c) => ({ type: 'resource' as ScanContentType, id: c.contentId, authorId: c.uploaderId, text: `${c.title}\n${c.description ?? ''}`, extra: { title: c.title } })),
    ];
    const already = items.length ? await this.prisma.contentScanResult.findMany({ where: { groupId, contentId: { in: items.map((i) => i.id) } }, select: { contentId: true, contentType: true } }) : [];
    const seen = new Set(already.map((a) => `${a.contentType}:${a.contentId}`));
    const flagged = items.filter((i) => !seen.has(`${i.type}:${i.id}`)).map((i) => ({ i, r: scoreText(i.text) })).filter(({ r }) => r.score >= threshold);
    const { count } = await this.prisma.contentScanResult.createMany({
      skipDuplicates: true,
      data: flagged.map(({ i, r }) => ({ contentType: i.type, scanType: 'automated' as const, riskScore: r.score, flaggedCategories: r.categories, groupId, contentId: i.id, authorId: i.authorId, details: { excerpt: i.text.slice(0, 200), matches: r.matches, ...i.extra } })),
    });
    return { success: true, data: { scanned: items.length, alreadyScanned: items.length - items.filter((i) => !seen.has(`${i.type}:${i.id}`)).length, flagged: count, sensitivity: dto.sensitivity } };
  }

  async scans(user: AuthUser, groupId: string, q: ListScansQueryDto) {
    await this.modCtx(user, groupId);
    const where: Prisma.ContentScanResultWhereInput = { groupId, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      this.prisma.contentScanResult.findMany({ where, orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }], skip: skipOf(q), take: q.limit }),
      this.prisma.contentScanResult.count({ where }),
    ]);
    const ids = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
    const people = ids.length ? await this.prisma.user.findMany({ where: { userId: { in: ids } }, select: PERSON }) : [];
    const p = new Map(people.map((x) => [x.userId, x]));
    return paginated(rows.map((r) => ({ ...r, author: r.authorId ? p.get(r.authorId) ?? null : null })), total, q);
  }

  async reviewScan(user: AuthUser, groupId: string, scanId: string, dto: ReviewScanDto) {
    const ctx = await this.modCtx(user, groupId);
    if (dto.removeContent && dto.status !== 'actioned') throw new BadRequestException('removeContent só com o estado actioned');
    const scan = await this.prisma.contentScanResult.findFirst({ where: { scanId, groupId } });
    if (!scan) throw new NotFoundException({ message: 'Análise não encontrada', code: 'SCAN_NOT_FOUND' });
    if (scan.status === 'actioned' || scan.status === 'falsePositive') throw new ConflictException({ message: 'Esta análise já foi decidida', code: 'ALREADY_DECIDED' });
    const { count } = await this.prisma.contentScanResult.updateMany({
      where: { scanId, status: { in: ['pending', 'reviewed'] } }, data: { status: dto.status as ScanStatus, reviewedById: user.userId, reviewedAt: new Date() },
    });
    if (!count) throw new ConflictException({ message: 'Esta análise já foi decidida', code: 'ALREADY_DECIDED' });

    let removed = false;
    if (dto.removeContent && scan.contentId) {
      removed = await this.removeContent(user, groupId, scan.contentType, scan.contentId, (scan.details as { topicId?: string } | null)?.topicId);
      if (removed && scan.authorId) {
        await this.record(groupId, scan.authorId, user.userId, AT.remove_content, `Conteúdo sinalizado removido (${scan.flaggedCategories.join(', ') || 'risco'})`, { contentType: scan.contentType, contentId: scan.contentId });
        this.notice(scan.authorId, ctx.group.name, groupId, 'Conteúdo removido', 'Um conteúdo seu foi removido pela moderação.');
      }
    }
    return { success: true, data: { scanId, status: dto.status, contentRemoved: removed } };
  }

  private async removeContent(user: AuthUser, groupId: string, type: ScanContentType, id: string, topicId?: string) {
    try {
      if (type === 'post') await this.discussions.remove(user, groupId, id);
      else if (type === 'comment' && topicId) await this.discussions.removeReply(user, groupId, topicId, id);
      else if (type === 'resource') await this.contents.remove(user, groupId, id);
      else return false;
      return true;
    } catch (e) {
      if (e instanceof NotFoundException) return false; // já tinha sido apagado
      throw e;
    }
  }

  // ── Recursos ─────────────────────────────────────────────────────────────

  async appeal(user: AuthUser, groupId: string, dto: CreateAppealDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const a = await this.prisma.groupModerationAction.findFirst({ where: { actionId: dto.actionId, groupId, targetId: user.userId } });
    if (!a) throw new NotFoundException({ message: 'Medida não encontrada', code: 'ACTION_NOT_FOUND' });
    const inForce = !a.revokedAt && (a.type === 'ban' || (a.type === 'mute' && (!a.expiresAt || a.expiresAt > new Date())));
    if (a.type !== 'ban' && a.type !== 'mute') throw new BadRequestException({ message: 'Só se recorre de silenciamentos e banimentos', code: 'NOT_APPEALABLE' });
    if (!inForce) throw new ConflictException({ message: 'A medida já não está em vigor', code: 'NOT_IN_FORCE' });
    let appeal;
    try {
      appeal = await this.prisma.groupAppeal.create({ data: { actionId: a.actionId, groupId, userId: user.userId, message: dto.message } });
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ message: 'Já apresentou recurso desta medida', code: 'ALREADY_APPEALED' });
      throw e;
    }
    const managers = await this.prisma.studyGroupMember.findMany({ where: { groupId, status: 'active', role: { in: ['leader', 'co_leader'] }, userId: { not: user.userId } }, select: { userId: true } });
    for (const m of managers) this.notice(m.userId, ctx.group.name, groupId, 'Novo recurso de moderação', 'Um membro recorreu de uma medida de moderação.', NotificationType.MODERATION_APPEAL_SUBMITTED);
    return { success: true, data: appeal };
  }

  async appeals(user: AuthUser, groupId: string, q: ListAppealsQueryDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const where: Prisma.GroupAppealWhereInput = { groupId, ...(q.status && { status: q.status }), ...(!ctx.canManage && { userId: user.userId }) };
    const [rows, total] = await Promise.all([
      this.prisma.groupAppeal.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        include: { user: { select: PERSON }, action: { select: { actionId: true, type: true, reason: true, createdAt: true, expiresAt: true, revokedAt: true, moderator: { select: PERSON } } } },
      }),
      this.prisma.groupAppeal.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async decideAppeal(user: AuthUser, groupId: string, appealId: string, dto: DecideAppealDto) {
    const ctx = await this.modCtx(user, groupId, true);
    const ap = await this.prisma.groupAppeal.findFirst({ where: { appealId, groupId }, include: { action: true } });
    if (!ap) throw new NotFoundException({ message: 'Recurso não encontrado', code: 'APPEAL_NOT_FOUND' });
    if (ap.userId === user.userId) throw new ForbiddenException({ message: 'Não pode decidir o seu próprio recurso', code: 'CONFLICT_OF_INTEREST' });
    if (ap.action.moderatorId === user.userId && !ctx.isLeader) throw new ForbiddenException({ message: 'Quem aplicou a medida não decide o recurso', code: 'CONFLICT_OF_INTEREST' });

    const status = dto.decision;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.groupAppeal.updateMany({ where: { appealId, status: 'pending' }, data: { status, decidedById: user.userId, decisionNote: dto.note ?? null, decidedAt: new Date() } });
      if (!count) throw new ConflictException({ message: 'O recurso já foi decidido', code: 'ALREADY_DECIDED' });
      if (status === 'accepted') {
        const isBan = ap.action.type === 'ban';
        await tx.studyGroupMember.updateMany({ where: { groupId, userId: ap.userId, status: isBan ? 'banned' : 'muted' }, data: { status: 'active', mutedUntil: null } });
        await this.record(groupId, ap.userId, user.userId, isBan ? AT.unban : AT.unmute, `Recurso aceite${dto.note ? `: ${dto.note}` : ''}`, {}, tx);
      }
    });
    this.notice(ap.userId, ctx.group.name, groupId, status === 'accepted' ? 'Recurso aceite' : 'Recurso recusado',
      status === 'accepted' ? 'A medida foi levantada.' : `O seu recurso foi recusado.${dto.note ? ` ${dto.note}` : ''}`, NotificationType.MODERATION_APPEAL_DECISION);
    return { success: true, data: { appealId, status } };
  }

  // ── Painel ───────────────────────────────────────────────────────────────

  async dashboard(user: AuthUser, groupId: string) {
    await this.modCtx(user, groupId);
    const now = new Date();
    const since = new Date(now.getTime() - WARN_WINDOW_DAYS * 86_400_000);
    const [reports, scans, appeals, mutes, bans, byType, recent, repeat] = await Promise.all([
      this.prisma.contentReport.count({ where: { resolved: false, topic: { groupId } } }),
      this.prisma.contentScanResult.count({ where: { groupId, status: 'pending' } }),
      this.prisma.groupAppeal.count({ where: { groupId, status: 'pending' } }),
      this.prisma.studyGroupMember.count({ where: { groupId, status: 'muted', OR: [{ mutedUntil: null }, { mutedUntil: { gt: now } }] } }),
      this.prisma.studyGroupMember.count({ where: { groupId, status: 'banned' } }),
      this.prisma.groupModerationAction.groupBy({ by: ['type'], where: { groupId, createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.groupModerationAction.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' }, take: 10, include: { target: { select: PERSON }, moderator: { select: PERSON } } }),
      this.prisma.groupModerationAction.groupBy({ by: ['targetId'], where: { groupId, type: { in: ['warn', 'mute', 'ban'] }, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { targetId: 'desc' } }, take: 5 }),
    ]);
    const people = repeat.length ? await this.prisma.user.findMany({ where: { userId: { in: repeat.map((r) => r.targetId) } }, select: PERSON }) : [];
    const p = new Map(people.map((x) => [x.userId, x]));
    return {
      success: true,
      data: {
        pending: { reports, scans, appeals },
        inForce: { mutes, bans },
        last30Days: Object.fromEntries(byType.map((b) => [b.type, b._count._all])),
        mostSanctioned: repeat.map((r) => ({ user: p.get(r.targetId) ?? { userId: r.targetId }, actions: r._count._all })),
        recent,
      },
    };
  }
}
