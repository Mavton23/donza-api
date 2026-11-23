import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityBaseRole, CommunityMemberStatus, CommunityMembershipType, CommunityStatus, NotificationType, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommunitiesService } from './communities.service';
import {
  can,
  getCommunityAndMembership,
  loadMembership,
  MEMBER_STATUSES,
  PERMISSIONS,
  effectiveRank,
  requirePermission,
} from './community-access';
import { CreateRoleDto, UpdateMemberDto, UpdateRoleDto } from './dto/community.dto';

const USER_PUBLIC = { userId: true, username: true, avatarUrl: true, role: true } as const;
const INVITE_TTL_MS = 7 * 86_400_000;

@Injectable()
export class CommunityMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communities: CommunitiesService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  /** Admins e moderadores activos: quem recebe avisos de pedidos e novos membros. */
  private async managerIds(communityId: string, exceptUserId?: string) {
    const rows = await this.prisma.communityMember.findMany({
      where: { communityId, status: 'active', role: { in: ['admin', 'moderator'] }, ...(exceptUserId && { userId: { not: exceptUserId } }) },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ── Vínculo do próprio utilizador ─────────────────────────────────────────

  async myMembership(userId: string, communityId: string) {
    const { membership } = await getCommunityAndMembership(this.prisma, communityId, userId);
    const m = membership;
    return {
      success: true,
      data: {
        isMember: !!m && MEMBER_STATUSES.includes(m.status),
        role: m?.role ?? null,
        joinedAt: m?.joinedAt ?? null,
        status: m?.status ?? null,
        roles: m?.customRoles.map((c) => c.role) ?? [],
      },
    };
  }

  async join(user: AuthUser, communityId: string) {
    const { community, membership } = await getCommunityAndMembership(this.prisma, communityId, user.userId);
    if (community.status !== CommunityStatus.active) throw new BadRequestException('Esta comunidade não está a aceitar membros');

    if (membership) {
      if (membership.status === 'pending') throw new ConflictException('Solicitação de entrada já está pendente');
      if (membership.status === 'banned') throw new ForbiddenException('Você foi banido desta comunidade');
      throw new ConflictException('Você já é membro desta comunidade');
    }

    // Um convite válido dispensa aprovação e permite entrar em comunidades só por convite.
    const invite = await this.findInvite(communityId, user.userId);
    let status: CommunityMemberStatus;
    if (invite || community.membershipType === CommunityMembershipType.open) status = 'active';
    else if (community.membershipType === CommunityMembershipType.approval) status = 'pending';
    else throw new ForbiddenException('Esta comunidade requer convite para entrada');

    const member = await this.prisma.$transaction(async (tx) => {
      const m = await tx.communityMember.create({ data: { communityId, userId: user.userId, role: 'member', status } });
      if (invite) await tx.communityInvite.update({ where: { inviteId: invite.inviteId }, data: { status: 'accepted', userId: user.userId } });
      return m;
    });

    const me = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true } });
    const managers = await this.managerIds(communityId, user.userId);
    if (status === 'pending') {
      await this.notifications.notifyMany(managers, NotificationType.DONZA_NOTIFICATION, {
        title: 'Novo pedido de entrada',
        message: `${me?.username ?? 'Um utilizador'} pediu para entrar na comunidade "${community.name}".`,
        relatedEntityId: communityId,
        metadata: { kind: 'community_join_request', userId: user.userId },
      });
    } else {
      await this.notifications.notifyMany(managers, NotificationType.NEW_COMMUNITY_MEMBER, {
        title: 'Novo membro',
        message: `${me?.username ?? 'Um utilizador'} entrou na comunidade "${community.name}".`,
        relatedEntityId: communityId,
      });
    }
    return {
      success: true,
      message: status === 'pending' ? 'Solicitação de entrada enviada' : 'Você entrou na comunidade',
      data: { communityId, userId: user.userId, role: member.role, status: member.status, joinedAt: member.joinedAt },
    };
  }

  private async findInvite(communityId: string, userId: string) {
    const me = await this.prisma.user.findUnique({ where: { userId }, select: { email: true, isVerified: true } });
    if (!me) return null;
    return this.prisma.communityInvite.findFirst({
      where: {
        communityId,
        status: 'pending',
        expiresAt: { gt: new Date() },
        // email só vale se verificado (evita registar o email de outra pessoa para roubar o convite)
        OR: [{ userId }, ...(me.isVerified ? [{ email: { equals: me.email, mode: 'insensitive' as const } }] : [])],
      },
    });
  }

  /** Sair, ou cancelar um pedido pendente. Banidos não podem "sair" (apagaria o banimento). */
  async leave(userId: string, communityId: string) {
    const { community, membership } = await getCommunityAndMembership(this.prisma, communityId, userId);
    if (!membership) throw new NotFoundException('Você não é membro desta comunidade');
    if (membership.status === 'banned') throw new ForbiddenException('Você foi banido desta comunidade');

    if (membership.role === 'admin') {
      const otherAdmins = await this.prisma.communityMember.count({ where: { communityId, role: 'admin', status: 'active', userId: { not: userId } } });
      if (otherAdmins === 0) throw new ConflictException('Você é o único administrador. Promova outro administrador antes de sair.');
    }
    await this.prisma.communityMember.delete({ where: { memberId: membership.memberId } }); // papéis em cascata

    if (membership.status !== 'pending') {
      const me = await this.prisma.user.findUnique({ where: { userId }, select: { username: true } });
      await this.notifications.notifyMany(await this.managerIds(communityId, userId), NotificationType.MEMBER_LEFT_COMMUNITY, {
        title: 'Membro saiu',
        message: `${me?.username ?? 'Um membro'} saiu da comunidade "${community.name}".`,
        relatedEntityId: communityId,
      });
    }
    return { success: true, message: membership.status === 'pending' ? 'Pedido cancelado' : 'Você saiu da comunidade', data: { communityId, userId } };
  }

  // ── Listagens de membros ──────────────────────────────────────────────────

  async list(viewer: AuthUser | undefined, idOrSlug: string, q: { page: number; limit: number; search?: string }) {
    const { data: detail } = await this.communities.getDetail(idOrSlug, viewer); // aplica a regra de visibilidade
    const where: Prisma.CommunityMemberWhereInput = {
      communityId: detail.communityId,
      status: { in: MEMBER_STATUSES },
      ...(q.search && { user: { username: { contains: q.search, mode: 'insensitive' } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where,
        orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
        skip: skipOf(q),
        take: q.limit,
        select: {
          role: true,
          status: true,
          joinedAt: true,
          user: { select: USER_PUBLIC },
          customRoles: { select: { role: { select: { roleId: true, name: true } } } },
        },
      }),
      this.prisma.communityMember.count({ where }),
    ]);
    return paginated(
      rows.map((m) => ({ ...m.user, userRole: m.user.role, role: m.role, status: m.status, joinedAt: m.joinedAt, roles: m.customRoles.map((c) => c.role) })),
      total,
      q,
    );
  }

  async pendingRequests(user: AuthUser, communityId: string, q: { page: number; limit: number }) {
    await requirePermission(this.prisma, user, communityId, 'inviteMembers');
    const where: Prisma.CommunityMemberWhereInput = { communityId, status: 'pending' };
    const [rows, total] = await Promise.all([
      this.prisma.communityMember.findMany({ where, orderBy: { joinedAt: 'asc' }, skip: skipOf(q), take: q.limit, select: { joinedAt: true, user: { select: USER_PUBLIC } } }),
      this.prisma.communityMember.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...r.user, requestedAt: r.joinedAt })), total, q);
  }

  async reviewRequest(user: AuthUser, communityId: string, targetId: string, approve: boolean) {
    const { community } = await requirePermission(this.prisma, user, communityId, 'inviteMembers');
    const res = approve
      ? await this.prisma.communityMember.updateMany({ where: { communityId, userId: targetId, status: 'pending' }, data: { status: 'active', joinedAt: new Date() } })
      : await this.prisma.communityMember.deleteMany({ where: { communityId, userId: targetId, status: 'pending' } });
    if (res.count === 0) throw new NotFoundException('Pedido não encontrado');

    await this.notifications.notify(targetId, NotificationType.DONZA_NOTIFICATION, {
      title: approve ? 'Pedido aprovado' : 'Pedido recusado',
      message: approve
        ? `O seu pedido para entrar em "${community.name}" foi aprovado.`
        : `O seu pedido para entrar em "${community.name}" foi recusado.`,
      relatedEntityId: communityId,
    });
    if (approve) {
      await this.notifications.notifyMany(await this.managerIds(communityId, user.userId), NotificationType.NEW_COMMUNITY_MEMBER, {
        title: 'Novo membro',
        message: `Um novo membro entrou em "${community.name}".`,
        relatedEntityId: communityId,
      });
    }
    return { success: true, message: approve ? 'Pedido aprovado' : 'Pedido recusado' };
  }

  // ── Gestão de membros ─────────────────────────────────────────────────────

  /** Garante que o alvo existe, não é o criador e está abaixo do actor na hierarquia. */
  private async targetFor(user: AuthUser, communityId: string, targetId: string, perm: 'removeMembers' | 'editCommunity') {
    const { community, membership } = await requirePermission(this.prisma, user, communityId, perm);
    const target = await loadMembership(this.prisma, communityId, targetId);
    if (!target || target.status === 'pending') throw new NotFoundException('Membro não encontrado');
    if (targetId === community.creatorId && user.userId !== community.creatorId) throw new ForbiddenException('O criador da comunidade não pode ser alterado');
    if (targetId !== user.userId && effectiveRank(user, target) >= effectiveRank(user, membership)) {
      throw new ForbiddenException('Você não pode gerir um membro do mesmo nível ou superior');
    }
    return { community, actor: membership, target };
  }

  async updateMember(user: AuthUser, communityId: string, targetId: string, dto: UpdateMemberDto) {
    if (dto.role === undefined && dto.status === undefined) throw new BadRequestException('Indique role e/ou status');

    if (dto.role !== undefined) {
      // Mudar papéis base: só administradores (da comunidade ou do site).
      const { community, actor, target } = await this.targetFor(user, communityId, targetId, 'editCommunity');
      if (user.role !== UserRole.admin && actor?.role !== 'admin') throw new ForbiddenException('Apenas administradores podem alterar papéis');
      if (target.role === 'admin' && dto.role !== 'admin') {
        const others = await this.prisma.communityMember.count({ where: { communityId, role: 'admin', status: 'active', userId: { not: targetId } } });
        if (others === 0) throw new ConflictException('A comunidade precisa de pelo menos um administrador');
      }
      if (targetId === community.creatorId && dto.role !== 'admin') throw new ForbiddenException('O criador tem de continuar administrador');
      if (target.status !== 'active' && target.status !== 'muted') throw new BadRequestException('Só membros activos podem mudar de papel');
    }
    if (dto.status !== undefined) {
      const { community, target } = await this.targetFor(user, communityId, targetId, 'removeMembers');
      if (targetId === user.userId) throw new BadRequestException('Não pode alterar o seu próprio estado');
      if (targetId === community.creatorId) throw new ForbiddenException('O criador da comunidade não pode ser alterado');
      void target;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.communityMember.update({
        where: { communityId_userId: { communityId, userId: targetId } },
        data: { ...(dto.role && { role: dto.role }), ...(dto.status && { status: dto.status }) },
      });
      if (dto.status === 'banned') await tx.communityMemberRole.deleteMany({ where: { memberId: m.memberId } });
      return m;
    });

    await this.notifications.notify(targetId, NotificationType.DONZA_NOTIFICATION, {
      title: 'A sua participação mudou',
      message:
        dto.status === 'banned' ? 'Foi banido de uma comunidade.'
        : dto.status === 'muted' ? 'Foi silenciado numa comunidade.'
        : dto.role ? `O seu papel numa comunidade passou a "${dto.role}".` : 'O seu estado numa comunidade foi reposto.',
      relatedEntityId: communityId,
    });
    return { success: true, data: { userId: targetId, role: updated.role, status: updated.status } };
  }

  async removeMember(user: AuthUser, communityId: string, targetId: string) {
    const { community, target } = await this.targetFor(user, communityId, targetId, 'removeMembers');
    if (targetId === user.userId) throw new BadRequestException('Use "sair da comunidade" para sair');
    if (target.status === 'banned') throw new ConflictException('Membro banido: reponha o estado em vez de remover (remover apagaria o banimento)');
    await this.prisma.communityMember.delete({ where: { memberId: target.memberId } });
    await this.notifications.notify(targetId, NotificationType.DONZA_NOTIFICATION, {
      title: 'Removido de uma comunidade',
      message: `Foi removido da comunidade "${community.name}".`,
      relatedEntityId: communityId,
    });
    return { success: true, message: 'Membro removido' };
  }

  // ── Papéis personalizados ─────────────────────────────────────────────────

  private cleanPerms(p: Record<string, unknown> | undefined): Prisma.InputJsonObject {
    return Object.fromEntries(PERMISSIONS.map((k) => [k, p?.[k] === true]));
  }

  private async adminCtx(user: AuthUser, communityId: string) {
    const ctx = await getCommunityAndMembership(this.prisma, communityId, user.userId);
    if (user.role !== UserRole.admin && !(ctx.membership?.status === 'active' && ctx.membership.role === 'admin')) {
      throw new ForbiddenException('Apenas administradores da comunidade podem gerir papéis');
    }
    return ctx;
  }

  async listRoles(user: AuthUser, communityId: string) {
    const { membership } = await getCommunityAndMembership(this.prisma, communityId, user.userId);
    if (user.role !== UserRole.admin && !(membership && MEMBER_STATUSES.includes(membership.status))) throw new ForbiddenException('Apenas membros');
    const roles = await this.prisma.communityRole.findMany({
      where: { communityId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return { success: true, data: roles.map(({ _count, ...r }) => ({ ...r, membersCount: _count.members })) };
  }

  async createRole(user: AuthUser, communityId: string, dto: CreateRoleDto) {
    await this.adminCtx(user, communityId);
    if (await this.prisma.communityRole.findFirst({ where: { communityId, name: { equals: dto.name, mode: 'insensitive' } } })) {
      throw new ConflictException('Já existe um papel com este nome');
    }
    const role = await this.prisma.communityRole.create({ data: { communityId, name: dto.name, permissions: this.cleanPerms(dto.permissions as any) } });
    return { success: true, data: role };
  }

  private async roleOf(communityId: string, roleId: string) {
    const role = await this.prisma.communityRole.findFirst({ where: { roleId, communityId } });
    if (!role) throw new NotFoundException('Papel não encontrado');
    return role;
  }

  async updateRole(user: AuthUser, communityId: string, roleId: string, dto: UpdateRoleDto) {
    await this.adminCtx(user, communityId);
    await this.roleOf(communityId, roleId);
    if (dto.name && (await this.prisma.communityRole.findFirst({ where: { communityId, name: { equals: dto.name, mode: 'insensitive' }, NOT: { roleId } } }))) {
      throw new ConflictException('Já existe um papel com este nome');
    }
    const role = await this.prisma.communityRole.update({
      where: { roleId },
      data: { ...(dto.name && { name: dto.name }), ...(dto.permissions && { permissions: this.cleanPerms(dto.permissions as any) }) },
    });
    return { success: true, data: role };
  }

  async deleteRole(user: AuthUser, communityId: string, roleId: string) {
    await this.adminCtx(user, communityId);
    await this.roleOf(communityId, roleId);
    await this.prisma.communityRole.delete({ where: { roleId } }); // atribuições em cascata
    return { success: true, message: 'Papel eliminado' };
  }

  /** Substitui o conjunto de papéis personalizados de um membro. */
  async assignRoles(user: AuthUser, communityId: string, targetId: string, roleIds: string[]) {
    await this.adminCtx(user, communityId);
    const target = await loadMembership(this.prisma, communityId, targetId);
    if (!target || target.status !== 'active') throw new NotFoundException('Membro activo não encontrado');
    const valid = await this.prisma.communityRole.count({ where: { communityId, roleId: { in: roleIds } } });
    if (valid !== roleIds.length) throw new BadRequestException('Algum papel não pertence a esta comunidade');
    await this.prisma.$transaction([
      this.prisma.communityMemberRole.deleteMany({ where: { memberId: target.memberId } }),
      this.prisma.communityMemberRole.createMany({ data: roleIds.map((roleId) => ({ memberId: target.memberId, roleId })) }),
    ]);
    return { success: true, data: { userId: targetId, roleIds } };
  }

  // ── Convites ──────────────────────────────────────────────────────────────

  async invite(user: AuthUser, communityId: string, email: string) {
    const { community } = await requirePermission(this.prisma, user, communityId, 'inviteMembers');
    if (community.status !== CommunityStatus.active) throw new BadRequestException('Comunidade inactiva');

    const invitee = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { userId: true, username: true } });
    if (invitee) {
      const m = await loadMembership(this.prisma, communityId, invitee.userId);
      if (m?.status === 'banned') throw new BadRequestException('Este utilizador está banido da comunidade');
      if (m && m.status !== 'pending') throw new ConflictException('Este utilizador já é membro');
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const existing = await this.prisma.communityInvite.findUnique({ where: { communityId_email: { communityId, email } } });
    const invite = existing
      ? await this.prisma.communityInvite.update({
          where: { inviteId: existing.inviteId },
          data: { status: 'pending', expiresAt, inviterId: user.userId, userId: invitee?.userId ?? null },
        })
      : await this.prisma.communityInvite.create({ data: { communityId, inviterId: user.userId, email, userId: invitee?.userId ?? null, expiresAt } });

    const text = `Foi convidado para a comunidade "${community.name}".`;
    if (invitee) {
      await this.notifications.notify(invitee.userId, NotificationType.DONZA_NOTIFICATION, {
        title: 'Convite para comunidade',
        message: text,
        relatedEntityId: communityId,
        metadata: { kind: 'community_invite', slug: community.slug },
      });
    }
    // Email também a quem ainda não tem conta (deve registar-se com este email).
    void this.mail.sendNotification(email, 'Convite para comunidade', `${text} Entre ou crie conta na Donza com este email e aceite o convite na página da comunidade (/communities/${community.slug}).`);
    return { success: true, data: { inviteId: invite.inviteId, email, expiresAt: invite.expiresAt, status: invite.status } };
  }

  async listInvites(user: AuthUser, communityId: string, q: { page: number; limit: number }) {
    await requirePermission(this.prisma, user, communityId, 'inviteMembers');
    const where: Prisma.CommunityInviteWhereInput = { communityId, status: 'pending', expiresAt: { gt: new Date() } };
    const [rows, total] = await Promise.all([
      this.prisma.communityInvite.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { inviteId: true, email: true, status: true, expiresAt: true, createdAt: true, inviter: { select: { userId: true, username: true } } },
      }),
      this.prisma.communityInvite.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async revokeInvite(user: AuthUser, communityId: string, inviteId: string) {
    await requirePermission(this.prisma, user, communityId, 'inviteMembers');
    const res = await this.prisma.communityInvite.updateMany({ where: { inviteId, communityId, status: 'pending' }, data: { status: 'revoked' } });
    if (res.count === 0) throw new NotFoundException('Convite não encontrado');
    return { success: true, message: 'Convite revogado' };
  }
}
