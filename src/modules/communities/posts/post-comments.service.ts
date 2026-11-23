import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommentStatus, NotificationType, PostType, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/post.dto';
import { POST_AUTHOR_SELECT, PostAccessService } from './post-access.service';

const REPLIES_PREVIEW = 5;
const EDIT_HISTORY_MAX = 10;
const ACTIVE = { status: CommentStatus.active };

@Injectable()
export class PostCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  private shape(c: { metadata: Prisma.JsonValue } & Record<string, unknown>) {
    const { metadata: _m, ...rest } = c;
    return rest;
  }

  /** Comentários de topo (respostas aceites primeiro, depois mais recentes) com pré-visualização de respostas. */
  async list(communityIdOrSlug: string, postId: string, viewer: AuthUser | undefined, q: { page: number; limit: number }) {
    const ctx = await this.access.context(communityIdOrSlug, viewer);
    await this.access.getInteractivePost(ctx, postId);
    const where: Prisma.PostCommentWhereInput = { postId, parentCommentId: null, ...ACTIVE };
    const [rows, total] = await Promise.all([
      this.prisma.postComment.findMany({
        where,
        orderBy: [{ isAnswer: 'desc' }, { createdAt: 'desc' }],
        skip: skipOf(q),
        take: q.limit,
        include: {
          author: { select: POST_AUTHOR_SELECT },
          replies: { where: ACTIVE, orderBy: { createdAt: 'asc' }, take: REPLIES_PREVIEW, include: { author: { select: POST_AUTHOR_SELECT } } },
          _count: { select: { replies: { where: ACTIVE } } },
        },
      }),
      this.prisma.postComment.count({ where }),
    ]);
    return paginated(
      rows.map(({ _count, replies, ...c }) => ({ ...this.shape(c), replies: replies.map((r) => this.shape(r)), repliesCount: _count.replies })),
      total,
      q,
    );
  }

  async replies(communityIdOrSlug: string, postId: string, commentId: string, viewer: AuthUser | undefined, q: { page: number; limit: number }) {
    const ctx = await this.access.context(communityIdOrSlug, viewer);
    await this.access.getInteractivePost(ctx, postId);
    const where: Prisma.PostCommentWhereInput = { postId, parentCommentId: commentId, ...ACTIVE };
    const [rows, total] = await Promise.all([
      this.prisma.postComment.findMany({ where, orderBy: { createdAt: 'asc' }, skip: skipOf(q), take: q.limit, include: { author: { select: POST_AUTHOR_SELECT } } }),
      this.prisma.postComment.count({ where }),
    ]);
    return paginated(rows.map((r) => this.shape(r)), total, q);
  }

  async create(communityIdOrSlug: string, postId: string, user: AuthUser, dto: CreateCommentDto) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    this.access.assertCanWrite(ctx);
    const post = await this.access.getInteractivePost(ctx, postId);
    if (post.isLocked && !ctx.isManager && !ctx.isSiteAdmin) throw new ForbiddenException('Os comentários deste post estão bloqueados');

    // Só um nível de resposta: responder a uma resposta anexa-se ao comentário de topo (antes ficavam invisíveis).
    let parent: { commentId: string; authorId: string; parentCommentId: string | null } | null = null;
    if (dto.parentCommentId) {
      parent = await this.prisma.postComment.findFirst({
        where: { commentId: dto.parentCommentId, postId, ...ACTIVE },
        select: { commentId: true, authorId: true, parentCommentId: true },
      });
      if (!parent) throw new NotFoundException('Comentário pai não encontrado');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      const c = await tx.postComment.create({
        data: { postId, authorId: user.userId, content: dto.content, parentCommentId: parent ? (parent.parentCommentId ?? parent.commentId) : null },
        include: { author: { select: POST_AUTHOR_SELECT } },
      });
      await this.access.recomputeStats(tx, postId);
      return c;
    });

    const who = (await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true } }))?.username ?? 'Alguém';
    const notified = new Set<string>([user.userId]);
    if (parent && !notified.has(parent.authorId)) {
      notified.add(parent.authorId);
      await this.notifications.notify(parent.authorId, NotificationType.COMMENT_REPLY, {
        title: 'Nova resposta', message: `${who} respondeu ao seu comentário.`, relatedEntityId: postId, metadata: { postId, commentId: comment.commentId },
      });
    }
    if (!notified.has(post.authorId)) {
      await this.notifications.notify(post.authorId, NotificationType.NEW_COMMENT, {
        title: 'Novo comentário', message: `${who} comentou o seu post "${post.title}".`, relatedEntityId: postId, metadata: { postId, commentId: comment.commentId },
      });
    }
    return { success: true, message: 'Comentário criado', data: this.shape(comment) };
  }

  async update(communityIdOrSlug: string, postId: string, commentId: string, user: AuthUser, dto: UpdateCommentDto) {
    if (dto.content === undefined && dto.isAnswer === undefined) throw new BadRequestException('Nada para alterar');
    const ctx = await this.access.context(communityIdOrSlug, user);
    const post = await this.access.getInteractivePost(ctx, postId);
    const comment = await this.prisma.postComment.findFirst({ where: { commentId, postId, ...ACTIVE } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');

    if (dto.content !== undefined) {
      // Só o autor reescreve o seu texto (o Express deixava um "moderador" que nem existe como role de site).
      if (comment.authorId !== user.userId) throw new ForbiddenException('Apenas o autor pode editar o comentário');
      this.access.assertCanWrite(ctx);
    }
    if (dto.isAnswer !== undefined) {
      if (post.authorId !== user.userId && !ctx.isManager && !ctx.isSiteAdmin) throw new ForbiddenException('Apenas o autor do post (ou a moderação) marca respostas');
      if (post.postType !== PostType.question) throw new BadRequestException('Só posts do tipo "question" têm resposta aceite');
      if (comment.parentCommentId) throw new BadRequestException('Só comentários de topo podem ser a resposta aceite');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      const meta = (comment.metadata ?? {}) as { editHistory?: unknown[] };
      await tx.postComment.update({
        where: { commentId },
        data: {
          ...(dto.content !== undefined && {
            content: dto.content,
            metadata: { ...meta, editHistory: [...(meta.editHistory ?? []), { editedAt: new Date().toISOString(), previousContent: comment.content }].slice(-EDIT_HISTORY_MAX) } as Prisma.InputJsonObject,
          }),
          ...(dto.isAnswer !== undefined && { isAnswer: dto.isAnswer }),
        },
      });
      if (dto.isAnswer !== undefined) {
        if (dto.isAnswer) await tx.postComment.updateMany({ where: { postId, isAnswer: true, NOT: { commentId } }, data: { isAnswer: false } }); // uma só
        await tx.communityPost.update({ where: { postId }, data: { acceptedAnswerId: dto.isAnswer ? commentId : null } });
      }
    });

    const updated = await this.prisma.postComment.findUniqueOrThrow({ where: { commentId }, include: { author: { select: POST_AUTHOR_SELECT } } });
    return { success: true, message: 'Comentário atualizado', data: this.shape(updated) };
  }

  /** Apaga o comentário e as suas respostas (soft delete) e refaz a contagem. */
  async remove(communityIdOrSlug: string, postId: string, commentId: string, user: AuthUser) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    const post = await this.access.getInteractivePost(ctx, postId);
    const comment = await this.prisma.postComment.findFirst({ where: { commentId, postId, ...ACTIVE } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    const own = comment.authorId === user.userId;
    if (!own && !ctx.isManager && !ctx.isSiteAdmin) throw new ForbiddenException('Você não tem permissão para apagar este comentário');

    await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      await tx.postComment.updateMany({
        where: { postId, ...ACTIVE, OR: [{ commentId }, { parentCommentId: commentId }] },
        data: { status: CommentStatus.deleted, deletedAt: new Date(), isAnswer: false },
      });
      if (post.acceptedAnswerId === commentId) await tx.communityPost.update({ where: { postId }, data: { acceptedAnswerId: null } });
      await this.access.recomputeStats(tx, postId);
    });

    if (!own) {
      await this.notifications.notify(comment.authorId, NotificationType.COMMENT_DELETED, {
        title: 'Comentário removido', message: `O seu comentário em "${post.title}" foi removido pela moderação.`, relatedEntityId: postId,
      });
    }
    return { success: true, message: 'Comentário apagado' };
  }
}
