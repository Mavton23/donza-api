import { ModerationService } from './moderation/moderation.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, ActivityType, NotificationType, Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { fromApiRole, groupContext, GroupCtx, rankOfRole, requireMember, toApiRole } from './study-group-access';
import { JoinGroupDto, UpdateMemberDto } from './dto/study-group.dto';

const USER_MIN = { userId: true, username: true, avatarUrl: true } as const;
const LIVE: Prisma.StudyGroupMemberWhereInput = { status: { in: ['active', 'muted'] } };

const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Injectable()
export class StudyGroupMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
    private readonly moderation: ModerationService,
  ) {}

  /** Líder, co-líder e moderadores activos: recebem avisos de pedidos. */
  private async staffIds(groupId: string, except?: string) {
    const rows = await this.prisma.studyGroupMember.findMany({
      where: { groupId, status: 'active', role: { in: ['leader', 'co_leader', 'moderator'] }, ...(except && { userId: { not: except } }) },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private requireModerator(ctx: GroupCtx) {
    if (!ctx.canModerate) throw new ForbiddenException('Apenas a liderança do grupo pode fazer isto');
  }

  /** Torna o utilizador membro activo (cria, ou reactiva quem tinha saído). Corre dentro de transacção com o grupo bloqueado. */
  private async activate(tx: Prisma.TransactionClient, groupId: string, userId: string, method: 'direct' | 'invite' | 'approval', code?: string) {
    await tx.$queryRaw`SELECT 1 FROM study_groups WHERE "groupId" = ${groupId}::uuid FOR UPDATE`; // serializa o controlo de lotação
    const group = await tx.studyGroup.findUniqueOrThrow({ where: { groupId }, select: { maxMembers: true } });
    if (group.maxMembers != null) {
      const taken = await tx.studyGroupMember.count({ where: { groupId, ...LIVE } });
      if (taken >= group.maxMembers) throw new ConflictException('Este grupo atingiu o número máximo de membros');
    }
    const existing = await tx.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing?.status === 'banned') throw new ForbiddenException('Você foi banido deste grupo e não pode entrar novamente.');
    if (existing && existing.status !== 'left') throw new ConflictException('Você já é membro deste grupo');
    const now = new Date();
    return existing
      ? tx.studyGroupMember.update({
          where: { membershipId: existing.membershipId },
          data: { status: 'active', role: 'member', leftAt: null, mutedUntil: null, joinedAt: now, lastActiveAt: now, joinMethod: 'rejoined', inviteCodeUsed: code ?? null },
        })
      : tx.studyGroupMember.create({ data: { groupId, userId, role: 'member', status: 'active', joinMethod: method, inviteCodeUsed: code, lastActiveAt: now } });
  }

  // ── O meu vínculo ─────────────────────────────────────────────────────────

  async myMembership(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const m = ctx.member;
    if (!m || !(ctx.status === 'active' || ctx.status === 'muted')) return { success: true, data: null };
    return {
      success: true,
      data: {
        membershipId: m.membershipId, groupId, userId: m.userId, role: toApiRole(m.role), status: ctx.status,
        mutedUntil: ctx.status === 'muted' ? m.mutedUntil : null, joinedAt: m.joinedAt, contributionScore: m.contributionScore,
        group: { groupId, name: ctx.group.name, communityId: ctx.group.communityId },
      },
    };
  }

  /** member | banned | pending | invited | rejected | none */
  async joinStatus(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (ctx.status === 'active' || ctx.status === 'muted') return { success: true, data: { status: 'member', message: 'Você já é membro deste grupo' } };
    if (ctx.status === 'banned') return { success: true, data: { status: 'banned', message: 'Você foi banido deste grupo' } };
    const p = await this.prisma.studyGroupPendingMember.findUnique({ where: { groupId_userId: { groupId, userId: user.userId } } });
    if (p?.status === 'pending') {
      return { success: true, data: p.isInvite ? { status: 'invited', message: 'Você foi convidado', invitedAt: p.requestedAt } : { status: 'pending', message: 'Solicitação de entrada pendente', requestedAt: p.requestedAt, requestMessage: p.message } };
    }
    if (p?.status === 'rejected' && !p.isInvite) return { success: true, data: { status: 'rejected', message: 'Solicitação de entrada rejeitada', rejectedAt: p.reviewedAt, responseMessage: p.responseMessage } };
    return { success: true, data: { status: 'none', message: 'Nenhuma solicitação encontrada' } };
  }

  // ── Entrar / sair ─────────────────────────────────────────────────────────

  async join(user: AuthUser, groupId: string, dto: JoinGroupDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const g = ctx.group;
    if (g.status !== 'active') throw new BadRequestException('Este grupo não está a aceitar membros');
    if (ctx.status === 'banned') throw new ForbiddenException('Você foi banido deste grupo e não pode entrar novamente.');
    if (ctx.status === 'active' || ctx.status === 'muted') throw new ConflictException('Você já é membro ativo deste grupo');
    if (g.communityId) {
      const cm = await this.prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: g.communityId, userId: user.userId } }, select: { status: true } });
      if (cm?.status !== 'active') throw new ForbiddenException('Você precisa ser membro ativo da comunidade deste grupo');
    }

    const pend = await this.prisma.studyGroupPendingMember.findUnique({ where: { groupId_userId: { groupId, userId: user.userId } } });
    const invited = pend?.isInvite === true && pend.status === 'pending';
    const codeOk = !!dto.inviteCode && !!g.inviteCode && sameCode(dto.inviteCode, g.inviteCode);
    if (dto.inviteCode && !codeOk && !invited) throw new ForbiddenException('Código de convite inválido');

    let decision: 'join' | 'request';
    if (g.privacy === 'public') decision = g.approvalRequired && !invited ? 'request' : 'join';
    else if (codeOk || invited) decision = 'join';
    else if (g.privacy === 'private') decision = 'request';
    else throw new ForbiddenException('Este grupo só aceita membros por convite');

    if (decision === 'request') {
      if (pend?.status === 'pending' && !pend.isInvite) throw new ConflictException('Você já tem uma solicitação pendente para este grupo');
      await this.prisma.studyGroupPendingMember.upsert({
        where: { groupId_userId: { groupId, userId: user.userId } },
        create: { groupId, userId: user.userId, message: dto.message, status: 'pending' },
        update: { status: 'pending', isInvite: false, message: dto.message, requestedAt: new Date(), reviewedAt: null, reviewedById: null, responseMessage: null },
      });
      const me = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true } });
      await this.notifications.notifyMany(await this.staffIds(groupId), NotificationType.STUDY_GROUP_JOIN_REQUEST, {
        title: 'Novo pedido de entrada',
        message: `${me?.username ?? 'Um utilizador'} pediu para entrar no grupo "${g.name}".`,
        relatedEntityId: groupId,
      });
      return { success: true, message: 'Solicitação de entrada enviada com sucesso', data: { groupId, status: 'pending' } };
    }

    const method = invited || codeOk ? 'invite' : 'direct';
    const member = await this.prisma.$transaction(async (tx) => {
      const m = await this.activate(tx, groupId, user.userId, method, codeOk ? dto.inviteCode : undefined);
      if (pend) await tx.studyGroupPendingMember.update({ where: { requestId: pend.requestId }, data: { status: 'approved', reviewedAt: new Date(), ...(invited ? {} : { reviewedById: null }) } });
      return m;
    });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.group_join, entityType: ActivityEntityType.study_group, entityId: groupId, metadata: { method: member.joinMethod } });
    return {
      success: true,
      message: member.joinMethod === 'rejoined' ? 'Você voltou ao grupo com sucesso' : 'Você entrou no grupo com sucesso',
      data: { groupId, status: 'active', membership: { role: toApiRole(member.role), joinedAt: member.joinedAt, joinMethod: member.joinMethod } },
    };
  }

  /** O líder tem de transferir a liderança antes de sair (o grupo nunca fica sem líder). */
  async leave(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const m = ctx.member;
    if (!m || !(ctx.status === 'active' || ctx.status === 'muted')) throw new NotFoundException('Você não é membro ativo deste grupo');
    if (m.role === 'leader') throw new ConflictException('Você é o líder. Transfira a liderança para outro membro antes de sair.');
    await this.prisma.studyGroupMember.update({
      where: { membershipId: m.membershipId },
      data: { status: 'left', leftAt: new Date(), previousRole: m.role, mutedUntil: null, lastActiveAt: new Date() },
    });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.group_leave, entityType: ActivityEntityType.study_group, entityId: groupId });
    return { success: true, message: 'Você saiu do grupo com sucesso', data: { groupId, groupName: ctx.group.name, leftAt: new Date(), previousRole: toApiRole(m.role), contributionScore: m.contributionScore } };
  }

  // ── Membros ───────────────────────────────────────────────────────────────

  async list(user: AuthUser, groupId: string, q: { page: number; limit: number; search?: string }) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const where: Prisma.StudyGroupMemberWhereInput = {
      groupId,
      // a liderança também vê banidos (para os poder repor)
      ...(ctx.canModerate ? { status: { in: ['active', 'muted', 'banned'] } } : LIVE),
      ...(q.search && { user: { username: { contains: q.search, mode: 'insensitive' } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.studyGroupMember.findMany({
        where, orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }], skip: skipOf(q), take: q.limit,
        select: { membershipId: true, role: true, status: true, mutedUntil: true, joinedAt: true, contributionScore: true, lastActiveAt: true, user: { select: USER_MIN } },
      }),
      this.prisma.studyGroupMember.count({ where }),
    ]);
    return paginated(rows.map(({ user: u, role, ...m }) => ({ ...u, ...m, role: toApiRole(role) })), total, q);
  }

  private async target(ctx: GroupCtx, targetId: string) {
    const t = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: ctx.group.groupId, userId: targetId } } });
    if (!t || t.status === 'left') throw new NotFoundException('Membro não encontrado');
    return t;
  }

  async updateMember(user: AuthUser, groupId: string, targetId: string, dto: UpdateMemberDto) {
    if (dto.role === undefined && dto.status === undefined) throw new BadRequestException('Indique role e/ou status');
    const ctx = await groupContext(this.prisma, groupId, user);
    const t = await this.target(ctx, targetId);
    if (targetId === user.userId) throw new BadRequestException('Não pode alterar o seu próprio papel ou estado');
    if (t.role === 'leader') throw new ForbiddenException('O líder só muda com a transferência de liderança');

    const data: Prisma.StudyGroupMemberUpdateInput = {};
    if (dto.role !== undefined) {
      if (!ctx.isLeader) throw new ForbiddenException('Apenas o líder altera papéis');
      if (t.status !== 'active' && t.status !== 'muted') throw new BadRequestException('Só membros activos mudam de papel');
      data.role = fromApiRole(dto.role);
      data.previousRole = t.role;
    }
    if (dto.status !== undefined) {
      this.requireModerator(ctx);
      if (ctx.rank <= rankOfRole(t.role)) throw new ForbiddenException('Você não pode gerir um membro do mesmo nível ou superior');
      if (t.status === 'banned' && !ctx.canManage) throw new ForbiddenException('Apenas co-líderes e o líder repõem banidos');
      data.status = dto.status;
      data.mutedUntil = dto.status === 'muted' && dto.muteMinutes ? new Date(Date.now() + dto.muteMinutes * 60_000) : null;
      if (dto.status === 'banned') { data.previousRole = t.role; data.role = 'member'; }
    }
    const updated = await this.prisma.studyGroupMember.update({ where: { membershipId: t.membershipId }, data });

    if (dto.role !== undefined) {
      await this.activity.log({ userId: targetId, groupId, type: ActivityType.group_role_change, entityType: ActivityEntityType.study_group, entityId: groupId, metadata: { role: dto.role, by: user.userId } });
      await this.notifications.notify(targetId, NotificationType.STUDY_GROUP_ROLE_CHANGE, {
        title: 'O seu papel mudou', message: `No grupo "${ctx.group.name}" você passou a ${dto.role}.`, relatedEntityId: groupId,
      });
    }
    if (dto.status !== undefined && dto.status !== t.status) {
      const type = dto.status === 'muted' ? 'mute' : dto.status === 'banned' ? 'ban' : t.status === 'banned' ? 'unban' : 'unmute';
      await this.moderation.record(groupId, targetId, user.userId, type, 'Alteração de estado de membro', type === 'mute' ? { durationMinutes: dto.muteMinutes, expiresAt: updated.mutedUntil } : {});
    }
    if (dto.status === 'banned' || dto.status === 'muted') {
      await this.notifications.notify(targetId, NotificationType.STUDY_GROUP_REMOVED, {
        title: dto.status === 'banned' ? 'Banido do grupo' : 'Silenciado no grupo',
        message: dto.status === 'banned' ? `Você foi banido do grupo "${ctx.group.name}".` : `Você foi silenciado no grupo "${ctx.group.name}".`,
        relatedEntityId: groupId,
      });
    }
    return { success: true, data: { userId: targetId, role: toApiRole(updated.role), status: updated.status, mutedUntil: updated.mutedUntil } };
  }

  /** Retira do grupo (pode voltar a entrar se as regras o permitirem; para impedir, use ban). */
  async removeMember(user: AuthUser, groupId: string, targetId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const t = await this.target(ctx, targetId);
    if (targetId === user.userId) throw new BadRequestException('Use "sair do grupo" para sair');
    if (t.role === 'leader') throw new ForbiddenException('Líderes só podem ser removidos por si mesmos');
    if (ctx.rank <= rankOfRole(t.role)) throw new ForbiddenException('Você não pode remover um membro do mesmo nível ou superior');
    if (t.status === 'banned') throw new ConflictException('Membro banido: reponha o estado em vez de remover (remover apagaria o banimento)');
    await this.prisma.studyGroupMember.update({ where: { membershipId: t.membershipId }, data: { status: 'left', leftAt: new Date(), previousRole: t.role, mutedUntil: null } });
    await this.notifications.notify(targetId, NotificationType.STUDY_GROUP_REMOVED, {
      title: 'Removido do grupo', message: `Você foi removido do grupo "${ctx.group.name}".`, relatedEntityId: groupId,
    });
    return { success: true, message: 'Membro removido com sucesso' };
  }

  async transferLeadership(user: AuthUser, groupId: string, targetId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.isLeader) throw new ForbiddenException('Apenas o líder transfere a liderança');
    const t = await this.target(ctx, targetId);
    if (t.status !== 'active') throw new BadRequestException('O novo líder tem de ser um membro activo');
    if (t.role === 'leader') throw new BadRequestException('Este membro já é o líder');
    const currentLeader = ctx.member && ctx.member.role === 'leader' ? ctx.member : await this.prisma.studyGroupMember.findFirstOrThrow({ where: { groupId, role: 'leader' } });
    await this.prisma.$transaction([
      this.prisma.studyGroupMember.update({ where: { membershipId: currentLeader.membershipId }, data: { role: 'co_leader', previousRole: 'leader' } }),
      this.prisma.studyGroupMember.update({ where: { membershipId: t.membershipId }, data: { role: 'leader', previousRole: t.role, joinMethod: 'promoted' } }),
    ]);
    await this.notifications.notify(targetId, NotificationType.STUDY_GROUP_ROLE_CHANGE, {
      title: 'Você é o novo líder', message: `Você passou a liderar o grupo "${ctx.group.name}".`, relatedEntityId: groupId,
    });
    return { success: true, message: 'Liderança transferida', data: { newLeaderId: targetId, previousLeaderId: currentLeader.userId } };
  }

  // ── Pedidos de entrada ────────────────────────────────────────────────────

  async requests(user: AuthUser, groupId: string, q: { page: number; limit: number }) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const where: Prisma.StudyGroupPendingMemberWhereInput = { groupId, status: 'pending', isInvite: false };
    const [rows, total] = await Promise.all([
      this.prisma.studyGroupPendingMember.findMany({
        where, orderBy: { requestedAt: 'asc' }, skip: skipOf(q), take: q.limit,
        select: { requestId: true, message: true, requestedAt: true, user: { select: { ...USER_MIN, fullName: true } } }, // sem email (o Express expunha-o)
      }),
      this.prisma.studyGroupPendingMember.count({ where }),
    ]);
    return paginated(rows.map(({ user: u, ...r }) => ({ ...r, ...u })), total, q);
  }

  async review(user: AuthUser, groupId: string, requestId: string, approve: boolean, responseMessage?: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const req = await this.prisma.studyGroupPendingMember.findFirst({ where: { requestId, groupId, status: 'pending', isInvite: false } });
    if (!req) throw new NotFoundException('Solicitação não encontrada ou já processada');

    let joined = false;
    await this.prisma.$transaction(async (tx) => {
      if (approve) {
        const existing = await tx.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.userId } }, select: { status: true } });
        if (existing && existing.status !== 'left') {
          if (existing.status === 'banned') throw new ConflictException('O utilizador está banido deste grupo');
        } else {
          await this.activate(tx, groupId, req.userId, 'approval');
          joined = true;
        }
      }
      await tx.studyGroupPendingMember.update({
        where: { requestId },
        data: { status: approve ? 'approved' : 'rejected', reviewedAt: new Date(), reviewedById: user.userId, responseMessage },
      });
    });
    if (joined) await this.activity.log({ userId: req.userId, groupId, type: ActivityType.group_join, entityType: ActivityEntityType.study_group, entityId: groupId, metadata: { method: 'approval' } });
    await this.notifications.notify(req.userId, approve ? NotificationType.STUDY_GROUP_REQUEST_APPROVED : NotificationType.STUDY_GROUP_REQUEST_REJECTED, {
      title: approve ? 'Pedido aprovado' : 'Pedido recusado',
      message: approve ? `Você foi aceite no grupo "${ctx.group.name}".` : `O seu pedido para o grupo "${ctx.group.name}" foi recusado.`,
      relatedEntityId: groupId,
    });
    return { success: true, message: approve ? 'Membro aprovado com sucesso' : 'Solicitação rejeitada com sucesso' };
  }

  // ── Convites ──────────────────────────────────────────────────────────────

  /** Convida vários utilizadores; devolve quem foi convidado e quem foi ignorado (e porquê). */
  async invite(user: AuthUser, groupId: string, userIds: string[]) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const g = ctx.group;
    if (g.privacy === 'public') throw new BadRequestException('Este grupo é público: não requer convites');
    if (g.status !== 'active') throw new BadRequestException('Este grupo não está a aceitar membros');

    const invited: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];
    for (const uid of userIds) {
      const target = await this.prisma.user.findUnique({ where: { userId: uid }, select: { status: true } });
      if (!target || target.status !== 'approved') { skipped.push({ userId: uid, reason: 'Utilizador não encontrado' }); continue; }
      const m = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: uid } }, select: { status: true } });
      if (m?.status === 'banned') { skipped.push({ userId: uid, reason: 'Utilizador banido do grupo' }); continue; }
      if (m && m.status !== 'left') { skipped.push({ userId: uid, reason: 'Já é membro' }); continue; }
      if (g.communityId) {
        const cm = await this.prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: g.communityId, userId: uid } }, select: { status: true } });
        if (cm?.status !== 'active') { skipped.push({ userId: uid, reason: 'Não é membro da comunidade' }); continue; }
      }
      const p = await this.prisma.studyGroupPendingMember.findUnique({ where: { groupId_userId: { groupId, userId: uid } } });
      if (p?.status === 'pending') { skipped.push({ userId: uid, reason: p.isInvite ? 'Já convidado' : 'Tem um pedido pendente (aprove-o)' }); continue; }
      await this.prisma.studyGroupPendingMember.upsert({
        where: { groupId_userId: { groupId, userId: uid } },
        create: { groupId, userId: uid, status: 'pending', isInvite: true, reviewedById: user.userId },
        update: { status: 'pending', isInvite: true, reviewedById: user.userId, requestedAt: new Date(), reviewedAt: null, message: null, responseMessage: null },
      });
      invited.push(uid);
    }
    await Promise.all(invited.map((uid) => this.notifications.notify(uid, NotificationType.STUDY_GROUP_INVITE, {
      title: 'Convite para grupo de estudo', message: `Foi convidado para o grupo "${g.name}".`, relatedEntityId: groupId,
    })));
    return { success: true, message: 'Convites enviados com sucesso', data: { invitedCount: invited.length, invited, skipped } };
  }

  async listInvites(user: AuthUser, groupId: string, q: { page: number; limit: number }) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const where: Prisma.StudyGroupPendingMemberWhereInput = { groupId, status: 'pending', isInvite: true };
    const [rows, total] = await Promise.all([
      this.prisma.studyGroupPendingMember.findMany({
        where, orderBy: { requestedAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { requestId: true, requestedAt: true, user: { select: USER_MIN }, reviewer: { select: { userId: true, username: true } } },
      }),
      this.prisma.studyGroupPendingMember.count({ where }),
    ]);
    return paginated(rows.map(({ user: u, reviewer, ...r }) => ({ ...r, ...u, invitedBy: reviewer })), total, q);
  }

  async revokeInvite(user: AuthUser, groupId: string, requestId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireModerator(ctx);
    const res = await this.prisma.studyGroupPendingMember.deleteMany({ where: { requestId, groupId, isInvite: true, status: 'pending' } });
    if (res.count === 0) throw new NotFoundException('Convite não encontrado');
    return { success: true, message: 'Convite revogado' };
  }

  /** Os convites pendentes do próprio utilizador. */
  async myInvites(userId: string, q: { page: number; limit: number }) {
    const where: Prisma.StudyGroupPendingMemberWhereInput = { userId, status: 'pending', isInvite: true, studyGroup: { status: 'active' } };
    const [rows, total] = await Promise.all([
      this.prisma.studyGroupPendingMember.findMany({
        where, orderBy: { requestedAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { requestedAt: true, reviewer: { select: { userId: true, username: true } }, studyGroup: { select: { groupId: true, name: true, description: true, privacy: true, community: { select: { communityId: true, name: true } } } } },
      }),
      this.prisma.studyGroupPendingMember.count({ where }),
    ]);
    return paginated(rows.map(({ studyGroup, reviewer, requestedAt }) => ({ ...studyGroup, invitedBy: reviewer, invitedAt: requestedAt })), total, q);
  }

  async declineInvite(userId: string, groupId: string) {
    const res = await this.prisma.studyGroupPendingMember.updateMany({
      where: { groupId, userId, isInvite: true, status: 'pending' },
      data: { status: 'rejected', reviewedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Convite não encontrado');
    return { success: true, message: 'Convite recusado' };
  }

  /** Confirma um código antes de entrar: devolve só o resumo do grupo. */
  async verifyCode(user: AuthUser, groupId: string, code: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const g = ctx.group;
    if (g.privacy === 'public' || !g.inviteCode || !sameCode(code, g.inviteCode) || g.status !== 'active') throw new NotFoundException('Convite inválido ou expirado');
    const membersCount = await this.prisma.studyGroupMember.count({ where: { groupId, ...LIVE } });
    return { success: true, data: { groupId, groupName: g.name, groupDescription: g.description, privacy: g.privacy, membersCount, community: g.community ? { communityId: g.community.communityId, name: g.community.name } : null } };
  }
}
