import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityMemberStatus, ConversationType, UserRole } from '@prisma/client';
import { can, getCommunityAndMembership, isMemberOf, communityWhere } from '../communities/community-access';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { groupContext, requireMember } from '../study-groups/study-group-access';

/** Onde vive uma mensagem: conversa directa, chat de um grupo de estudo ou chat de uma comunidade. */
export interface ChatCtx {
  type: ConversationType;
  id: string;
  name: string;
  canPost: boolean;
  /** pode apagar mensagens de outros */
  canModerate: boolean;
  /** todos os utilizadores que fazem parte do chat (inclui quem consulta) */
  members: () => Promise<string[]>;
}

export async function resolveChat(prisma: PrismaService, user: AuthUser, type: ConversationType, rawId: string): Promise<ChatCtx> {
  if (type === 'conversation') {
    const p = await prisma.participant.findFirst({ where: { contextType: 'conversation', contextId: rawId, userId: user.userId } });
    const c = p && (await prisma.conversation.findUnique({ where: { conversationId: rawId } }));
    if (!p || !c || !c.isActive) throw new NotFoundException('Conversa não encontrada');
    return {
      type, id: rawId, name: c.name ?? 'Conversa', canPost: true, canModerate: false,
      members: async () => (await prisma.participant.findMany({ where: { contextType: 'conversation', contextId: rawId }, select: { userId: true } })).map((x) => x.userId),
    };
  }
  if (type === 'group') {
    const ctx = await groupContext(prisma, rawId, user);
    requireMember(ctx);
    return {
      type, id: ctx.group.groupId, name: ctx.group.name,
      canPost: ctx.canWrite && ctx.group.status === 'active', canModerate: ctx.canModerate,
      members: async () => (await prisma.studyGroupMember.findMany({ where: { groupId: ctx.group.groupId, status: { in: ['active', 'muted'] } }, select: { userId: true } })).map((x) => x.userId),
    };
  }
  // comunidade: aceita UUID ou slug
  const found = await prisma.community.findFirst({ where: communityWhere(rawId), select: { communityId: true } });
  if (!found) throw new NotFoundException('Comunidade não encontrada');
  const { community, membership } = await getCommunityAndMembership(prisma, found.communityId, user.userId);
  const admin = user.role === UserRole.admin;
  if (!admin && !isMemberOf(membership)) throw new ForbiddenException('Acesso restrito a membros da comunidade');
  return {
    type, id: community.communityId, name: community.name,
    canPost: admin || membership?.status === CommunityMemberStatus.active,
    canModerate: can(user, membership, 'managePosts'),
    members: async () => (await prisma.communityMember.findMany({ where: { communityId: community.communityId, status: { in: ['active', 'muted'] } }, select: { userId: true } })).map((x) => x.userId),
  };
}
