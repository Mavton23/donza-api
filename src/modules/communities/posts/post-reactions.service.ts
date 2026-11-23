import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, PostReactionType } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { PostAccessService } from './post-access.service';

const PER_TYPE_USERS = 50;

@Injectable()
export class PostReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  private async currentStats(postId: string) {
    const p = await this.prisma.communityPost.findUniqueOrThrow({ where: { postId }, select: { postId: true, stats: true } });
    return p;
  }

  /** Idempotente: define a reacção do utilizador (uma por post). Trocar de tipo substitui. */
  async set(communityIdOrSlug: string, postId: string, user: AuthUser, type: PostReactionType) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    this.access.assertCanWrite(ctx);
    const post = await this.access.getInteractivePost(ctx, postId);

    let action: 'added' | 'updated' | 'unchanged' = 'added';
    const reaction = await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      const existing = await tx.postReaction.findUnique({ where: { postId_userId: { postId, userId: user.userId } } });
      if (existing?.type === type) { action = 'unchanged'; return existing; }
      action = existing ? 'updated' : 'added';
      const r = existing
        ? await tx.postReaction.update({ where: { reactionId: existing.reactionId }, data: { type } })
        : await tx.postReaction.create({ data: { postId, userId: user.userId, type } });
      await this.access.recomputeStats(tx, postId);
      return r;
    });

    if (action === 'added' && post.authorId !== user.userId) {
      await this.notifications.notify(post.authorId, NotificationType.POST_REACTION, {
        title: 'Nova reacção',
        message: `${await this.nameOf(user.userId)} reagiu ao seu post "${post.title}" (${type}).`,
        relatedEntityId: postId,
        metadata: { communityId: ctx.community.communityId, postId, type },
      });
    }
    const { stats } = await this.currentStats(postId);
    return { success: true, data: { action, reaction: { reactionId: reaction.reactionId, type: reaction.type, createdAt: reaction.createdAt }, stats } };
  }

  async remove(communityIdOrSlug: string, postId: string, user: AuthUser) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    await this.access.getInteractivePost(ctx, postId);
    await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      const res = await tx.postReaction.deleteMany({ where: { postId, userId: user.userId } });
      if (res.count === 0) throw new NotFoundException('Reação não encontrada');
      await this.access.recomputeStats(tx, postId);
    });
    const { stats } = await this.currentStats(postId);
    return { success: true, data: { action: 'removed', stats } };
  }

  async mine(communityIdOrSlug: string, postId: string, user: AuthUser | undefined) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    await this.access.getInteractivePost(ctx, postId);
    const r = user ? await this.prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId: user.userId } }, select: { type: true } }) : null;
    return { success: true, data: { reactionType: r?.type ?? null } };
  }

  /** Contagens exactas + até 50 utilizadores por tipo (o Express devolvia todos). */
  async list(communityIdOrSlug: string, postId: string, user: AuthUser | undefined) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    await this.access.getInteractivePost(ctx, postId);
    const [groups, rows] = await Promise.all([
      this.prisma.postReaction.groupBy({ by: ['type'], where: { postId }, _count: { _all: true } }),
      Promise.all(
        Object.values(PostReactionType).map(async (type) => [
          type,
          (await this.prisma.postReaction.findMany({
            where: { postId, type },
            orderBy: { createdAt: 'desc' },
            take: PER_TYPE_USERS,
            select: { user: { select: { userId: true, username: true, avatarUrl: true } } },
          })).map((r) => r.user),
        ] as const),
      ),
    ]);
    const counts = Object.fromEntries(Object.values(PostReactionType).map((t) => [t, groups.find((g) => g.type === t)?._count._all ?? 0]));
    return { success: true, data: { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), reactions: Object.fromEntries(rows.filter(([, u]) => u.length)) } };
  }

  private async nameOf(userId: string) {
    return (await this.prisma.user.findUnique({ where: { userId }, select: { username: true } }))?.username ?? 'Alguém';
  }
}
