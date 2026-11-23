import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityBaseRole, CommunityMemberStatus, Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

export const PERMISSIONS = ['managePosts', 'manageEvents', 'inviteMembers', 'removeMembers', 'editCommunity'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissões implícitas do papel base. `admin` tem todas. Papéis personalizados somam-se a estas. */
const BASE: Record<CommunityBaseRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  moderator: ['managePosts', 'manageEvents', 'inviteMembers', 'removeMembers'],
  member: [],
};

/** Quem pertence de facto à comunidade (pode ler conteúdo). `pending` e `banned` não. */
export const MEMBER_STATUSES: CommunityMemberStatus[] = [CommunityMemberStatus.active, CommunityMemberStatus.muted];

export const communityWhere = (idOrSlug: string): Prisma.CommunityWhereInput => ({
  ...(isUUID(idOrSlug) ? { communityId: idOrSlug } : { slug: idOrSlug }),
  deletedAt: null,
});

export interface MembershipInfo {
  memberId: string;
  userId: string;
  role: CommunityBaseRole;
  status: CommunityMemberStatus;
  joinedAt: Date;
  customRoles: { role: { roleId: string; name: string; permissions: Prisma.JsonValue } }[];
}

export const loadMembership = (prisma: PrismaService, communityId: string, userId: string) =>
  prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    include: { customRoles: { select: { role: { select: { roleId: true, name: true, permissions: true } } } } },
  });

const isSiteAdmin = (u: AuthUser | undefined) => u?.role === UserRole.admin;

export function can(user: AuthUser | undefined, m: MembershipInfo | null, perm: Permission): boolean {
  if (isSiteAdmin(user)) return true;
  if (!m || m.status !== CommunityMemberStatus.active) return false;
  if (BASE[m.role].includes(perm)) return true;
  return m.customRoles.some((cr) => (cr.role.permissions as Record<string, unknown> | null)?.[perm] === true);
}

/** admin do site 3 > admin da comunidade 2 > moderador 1 > membro 0. */
export function rank(user: AuthUser | undefined, m: { role: CommunityBaseRole } | null): number {
  if (isSiteAdmin(user)) return 3;
  return m ? { admin: 2, moderator: 1, member: 0 }[m.role] : -1;
}

/**
 * Rank para comparar quem gere quem. Um membro com papel personalizado que dá permissões fica a meio
 * (0.5): pode gerir membros comuns, mas não moderadores/admins nem outros com papéis.
 */
export function effectiveRank(user: AuthUser | undefined, m: MembershipInfo | null): number {
  const base = rank(user, m);
  if (!m || base !== 0) return base;
  const elevated = m.customRoles.some((cr) => Object.values((cr.role.permissions as Record<string, unknown>) ?? {}).some((v) => v === true));
  return elevated ? 0.5 : 0;
}

export const isMemberOf = (m: MembershipInfo | null) => !!m && MEMBER_STATUSES.includes(m.status);

/** Carrega a comunidade activa (ou 404) e o vínculo do utilizador. */
export async function getCommunityAndMembership(prisma: PrismaService, communityId: string, userId: string | undefined) {
  const community = await prisma.community.findFirst({ where: { communityId, deletedAt: null } });
  if (!community) throw new NotFoundException('Comunidade não encontrada');
  const membership = userId ? await loadMembership(prisma, communityId, userId) : null;
  return { community, membership };
}

export async function requirePermission(prisma: PrismaService, user: AuthUser, communityId: string, perm: Permission) {
  const ctx = await getCommunityAndMembership(prisma, communityId, user.userId);
  if (!can(user, ctx.membership, perm)) throw new ForbiddenException('Você não tem permissão para esta acção nesta comunidade');
  return ctx;
}

export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base || 'comunidade';
}
