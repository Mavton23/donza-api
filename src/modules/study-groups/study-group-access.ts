import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudyGroup, StudyGroupMember, StudyGroupMemberStatus, StudyGroupRole, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { MEMBER_STATUSES } from '../communities/community-access';

/** O enum Prisma chama-se `co_leader`; a API (como o Express) fala em `co-leader`. */
export const toApiRole = (r: StudyGroupRole | null | undefined) => (r === 'co_leader' ? 'co-leader' : (r ?? null));
export const fromApiRole = (r: string): StudyGroupRole => (r === 'co-leader' ? 'co_leader' : (r as StudyGroupRole));

/** líder 3 > co-líder 2 > moderador 1 > membro 0; admin do site 4. */
const RANK: Record<StudyGroupRole, number> = { leader: 3, co_leader: 2, moderator: 1, member: 0 };

/** Silenciamento com prazo expirado volta a `active` sem precisar de job. */
export function effectiveStatus(m: Pick<StudyGroupMember, 'status' | 'mutedUntil'> | null): StudyGroupMemberStatus | null {
  if (!m) return null;
  if (m.status === 'muted' && m.mutedUntil && m.mutedUntil <= new Date()) return 'active';
  return m.status;
}

export interface GroupCtx {
  group: StudyGroup & { community: { communityId: string; name: string; slug: string; isPublic: boolean; status: string } | null };
  viewer?: AuthUser;
  member: StudyGroupMember | null;
  status: StudyGroupMemberStatus | null;
  isSiteAdmin: boolean;
  /** membro activo ou silenciado (ou admin do site) */
  isMember: boolean;
  /** pode escrever: membro activo (ou admin do site) */
  canWrite: boolean;
  rank: number;
  /** líder ou co-líder */
  canManage: boolean;
  /** líder, co-líder ou moderador */
  canModerate: boolean;
  isLeader: boolean;
}

export const GROUP_COMMUNITY_SELECT = { communityId: true, name: true, slug: true, isPublic: true, status: true, deletedAt: true } as const;

/**
 * Carrega o grupo e o vínculo do utilizador. Grupo de comunidade privada/eliminada => 404 a quem não
 * pertence à comunidade. Grupos privados continuam descobríveis (para pedir entrada), mas sem conteúdo.
 */
export async function groupContext(prisma: PrismaService, groupId: string, viewer?: AuthUser): Promise<GroupCtx> {
  const g = await prisma.studyGroup.findUnique({ where: { groupId }, include: { community: { select: GROUP_COMMUNITY_SELECT } } });
  if (!g) throw new NotFoundException('Grupo de estudo não encontrado');
  const isSiteAdmin = viewer?.role === UserRole.admin;

  if (g.community) {
    if (g.community.deletedAt && !isSiteAdmin) throw new NotFoundException('Grupo de estudo não encontrado');
    if (!g.community.isPublic && !isSiteAdmin) {
      const cm = viewer
        ? await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: g.community.communityId, userId: viewer.userId } }, select: { status: true } })
        : null;
      if (!cm || !MEMBER_STATUSES.includes(cm.status)) throw new NotFoundException('Grupo de estudo não encontrado');
    }
  }
  const member = viewer ? await prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: viewer.userId } } }) : null;
  const status = effectiveStatus(member);
  const inGroup = status === 'active' || status === 'muted';
  const rank = isSiteAdmin ? 4 : inGroup && member ? RANK[member.role] : -1;
  return {
    group: g as GroupCtx['group'],
    viewer,
    member,
    status,
    isSiteAdmin,
    isMember: inGroup || isSiteAdmin,
    canWrite: status === 'active' || isSiteAdmin,
    rank,
    canManage: rank >= RANK.co_leader,
    canModerate: rank >= RANK.moderator,
    isLeader: rank >= RANK.leader,
  };
}

export const rankOfRole = (r: StudyGroupRole) => RANK[r];

export function requireMember(ctx: GroupCtx) {
  if (!ctx.isMember) throw new ForbiddenException('Acesso restrito a membros do grupo');
}
