import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { StudyGroupRole, UserRole } from '@prisma/client';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  GROUP_PERMISSION_KEY,
  GroupPermissionMeta,
  OwnerModel,
} from '../decorators/group-permission.decorator';

/** Hierarquia dos papéis de grupo (maior = mais poder). */
const ROLE_RANK: Record<StudyGroupRole, number> = {
  member: 0,
  moderator: 1,
  co_leader: 2,
  leader: 3,
};

type OwnerLookup = (prisma: PrismaService, id: string) => Promise<string | null | undefined>;

const OWNER_LOOKUPS: Record<OwnerModel, OwnerLookup> = {
  discussionTopic: async (p, id) =>
    (await p.discussionTopic.findUnique({ where: { topicId: id }, select: { authorId: true } }))?.authorId,
  discussionReply: async (p, id) =>
    (await p.discussionReply.findUnique({ where: { replyId: id }, select: { authorId: true } }))?.authorId,
  sharedContent: async (p, id) =>
    (await p.sharedContent.findUnique({ where: { contentId: id }, select: { uploaderId: true } }))?.uploaderId,
  groupTask: async (p, id) =>
    (await p.groupTask.findUnique({ where: { taskId: id }, select: { creatorId: true } }))?.creatorId,
};

/**
 * Fusão de `moderationPermissions` e `groupModerator`.
 * 1. O utilizador tem de ser membro ACTIVO do grupo (admin da plataforma passa sempre).
 * 2. Passa se for o autor do conteúdo (allowOwnerOf) ou se o cargo tiver a permissão em ModerationPermission.
 * 3. Com `targetUserParam`, aplica as regras de hierarquia (não actua sobre cargos superiores nem sobre líderes).
 */
@Injectable()
export class GroupPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<GroupPermissionMeta | undefined>(GROUP_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Utilizador não autenticado');
    if (user.role === UserRole.admin) return true;

    const groupId = req.params.groupId as string | undefined;
    if (!groupId) throw new BadRequestException('Parâmetro groupId em falta na rota');

    const member = await this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.userId } },
    });
    if (!member || member.status !== 'active') {
      throw new ForbiddenException('Você não é membro activo deste grupo');
    }

    if (meta.allowOwnerOf) {
      const contentId = req.params[meta.allowOwnerOf.param] as string | undefined;
      if (contentId) {
        const ownerId = await OWNER_LOOKUPS[meta.allowOwnerOf.model](this.prisma, contentId);
        if (ownerId === user.userId) return true;
      }
    }

    const row = await this.prisma.moderationPermission.findUnique({ where: { role: member.role } });
    const resourcePerms = (row?.permissions as Record<string, Record<string, boolean>> | null)?.[meta.resource];
    if (resourcePerms?.[meta.action] !== true) {
      throw new ForbiddenException('Ação não permitida para seu cargo');
    }

    if (meta.targetUserParam) {
      const targetUserId = req.params[meta.targetUserParam] as string | undefined;
      if (!targetUserId) throw new BadRequestException(`Parâmetro ${meta.targetUserParam} em falta na rota`);

      const target = await this.prisma.studyGroupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetUserId } },
      });
      if (!target) throw new NotFoundException('O utilizador alvo não é membro deste grupo');

      if (target.role === StudyGroupRole.leader) {
        throw new ForbiddenException('Não é permitido actuar sobre o líder do grupo');
      }
      if (ROLE_RANK[target.role] > ROLE_RANK[member.role]) {
        throw new ForbiddenException('Não é permitido actuar sobre membros com cargo superior');
      }
    }

    return true;
  }
}
