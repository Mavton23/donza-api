import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceType, NotificationType, PostStatus, PostType, PostVisibility, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { MEMBER_STATUSES } from '../community-access';
import { AttachmentDto, CreatePostDto, ListPostsQueryDto, MyPostsQueryDto, UpdatePostDto } from './dto/post.dto';
import { POST_AUTHOR_SELECT, PostAccessService, PostCtx } from './post-access.service';

const SORT_CAP = 5000; // posts considerados ao ordenar por popularidade (estatísticas vivem em JSON)
const EDIT_HISTORY_MAX = 20;

type Stats = { reactions?: Record<string, number>; viewCount?: number; commentCount?: number };
const statsOf = (s: Prisma.JsonValue): Required<Stats> => {
  const o = (s ?? {}) as Stats;
  return { reactions: o.reactions ?? {}, viewCount: o.viewCount ?? 0, commentCount: o.commentCount ?? 0 };
};
const totalReactions = (s: Required<Stats>) => Object.values(s.reactions).reduce((a, b) => a + (b || 0), 0);

export function makeExcerpt(content: string): string {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text; // cabe em VarChar(200) (o Express juntava '...' e rebentava)
}

export function deviceFrom(userAgent?: string): DeviceType {
  const ua = (userAgent ?? '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return DeviceType.tablet;
  if (/mobi|iphone|android/.test(ua)) return DeviceType.mobile;
  return DeviceType.desktop;
}

const LIST_INCLUDE = {
  author: { select: POST_AUTHOR_SELECT },
  tags: { select: { tag: { select: { name: true } } } },
  _count: { select: { attachments: true } },
} satisfies Prisma.CommunityPostInclude;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Listagens ──────────────────────────────────────────────────────────────

  private shapeListItem(p: Prisma.CommunityPostGetPayload<{ include: typeof LIST_INCLUDE }>, myReaction?: string | null) {
    const { content: _c, editHistory: _e, metadata: _m, tags, _count, stats, ...rest } = p;
    const s = statsOf(stats);
    return {
      ...rest,
      tags: tags.map((t) => t.tag.name),
      attachmentsCount: _count.attachments,
      stats: { reactions: s.reactions, reactionsTotal: totalReactions(s), viewCount: s.viewCount, commentCount: s.commentCount },
      ...(myReaction !== undefined && { myReaction }),
    };
  }

  private async reactionsOf(userId: string | undefined, postIds: string[]) {
    if (!userId || !postIds.length) return undefined;
    const rows = await this.prisma.postReaction.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true, type: true } });
    return new Map(rows.map((r) => [r.postId, r.type]));
  }

  async list(communityIdOrSlug: string, viewer: AuthUser | undefined, q: ListPostsQueryDto) {
    const ctx = await this.access.context(communityIdOrSlug, viewer);
    const where: Prisma.CommunityPostWhereInput = {
      communityId: ctx.community.communityId,
      status: PostStatus.published,
      AND: [
        this.access.visibilityWhere(ctx),
        ...(q.postType ? [{ postType: q.postType }] : []),
        ...(q.difficultyLevel ? [{ difficultyLevel: q.difficultyLevel }] : []),
        ...(q.search ? [{ OR: [{ title: { contains: q.search, mode: 'insensitive' as const } }, { excerpt: { contains: q.search, mode: 'insensitive' as const } }] }] : []),
        // todas as tags pedidas (Express: qualquer uma). AND é o que o filtro por tags espera.
        ...(q.tags ?? []).map((name) => ({ tags: { some: { tag: { name } } } })),
      ],
    };
    return this.pageOf(where, q, q.sort ?? 'newest', viewer?.userId);
  }

  async mine(communityIdOrSlug: string, viewer: AuthUser, q: MyPostsQueryDto) {
    const ctx = await this.access.context(communityIdOrSlug, viewer);
    const where: Prisma.CommunityPostWhereInput = {
      communityId: ctx.community.communityId,
      authorId: viewer.userId,
      status: q.status ?? { not: PostStatus.deleted },
    };
    return this.pageOf(where, q, 'newest', viewer.userId);
  }

  private async pageOf(where: Prisma.CommunityPostWhereInput, q: { page: number; limit: number }, sort: string, viewerId?: string) {
    const total = await this.prisma.communityPost.count({ where });
    let rows: Prisma.CommunityPostGetPayload<{ include: typeof LIST_INCLUDE }>[];

    if (sort === 'newest' || sort === 'oldest') {
      rows = await this.prisma.communityPost.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: sort === 'newest' ? [{ isPinned: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'asc' }],
        skip: skipOf(q),
        take: q.limit,
      });
    } else {
      // Popularidade vive em `stats` (JSON): ordena-se em memória sobre os candidatos e pagina-se por ids.
      const cand = await this.prisma.communityPost.findMany({
        where, select: { postId: true, stats: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: SORT_CAP,
      });
      const key = (s: Prisma.JsonValue) => {
        const st = statsOf(s);
        return sort === 'mostViewed' ? st.viewCount : sort === 'mostCommented' ? st.commentCount : totalReactions(st);
      };
      const ids = cand.sort((a, b) => key(b.stats) - key(a.stats) || b.createdAt.getTime() - a.createdAt.getTime()).slice(skipOf(q), skipOf(q) + q.limit).map((c) => c.postId);
      const found = await this.prisma.communityPost.findMany({ where: { postId: { in: ids } }, include: LIST_INCLUDE });
      const byId = new Map(found.map((p) => [p.postId, p]));
      rows = ids.map((id) => byId.get(id)!).filter(Boolean);
    }
    const mine = await this.reactionsOf(viewerId, rows.map((r) => r.postId));
    return paginated(rows.map((r) => this.shapeListItem(r, mine ? (mine.get(r.postId) ?? null) : undefined)), total, q);
  }

  // ── Detalhe (+ visualização) ──────────────────────────────────────────────

  async getDetail(communityIdOrSlug: string, postId: string, viewer: AuthUser | undefined, userAgent?: string) {
    const ctx = await this.access.context(communityIdOrSlug, viewer);
    const found = await this.access.getPost(ctx, postId);

    const post = await this.prisma.communityPost.findUniqueOrThrow({
      where: { postId: found.postId },
      include: {
        author: { select: POST_AUTHOR_SELECT },
        tags: { select: { relevance: true, tag: { select: { tagId: true, name: true } } } },
        objectives: { select: { relevance: true, objective: { select: { objectiveId: true, name: true, level: true, subjectArea: true } } } },
        attachments: { orderBy: { createdAt: 'asc' }, select: { attachmentId: true, url: true, type: true, title: true, description: true, metadata: true, createdAt: true } },
      },
    });

    // Conta uma visualização por utilizador (o Express somava a cada pedido). Autor e anónimos não contam.
    if (viewer && viewer.userId !== post.authorId && post.status === PostStatus.published) {
      const seen = await this.prisma.postView.count({ where: { postId, userId: viewer.userId } });
      if (!seen) {
        await this.prisma.$transaction([
          this.prisma.postView.create({ data: { postId, userId: viewer.userId, deviceType: deviceFrom(userAgent) } }),
          this.prisma.$executeRaw`UPDATE community_posts SET stats = jsonb_set(stats, '{viewCount}', to_jsonb(COALESCE((stats->>'viewCount')::int, 0) + 1), true) WHERE "postId" = ${postId}::uuid`,
        ]);
        const sv = statsOf(post.stats); sv.viewCount += 1; post.stats = { ...(post.stats as object), viewCount: sv.viewCount } as Prisma.JsonObject;
      }
    }

    const myReaction = viewer ? (await this.prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId: viewer.userId } }, select: { type: true } }))?.type ?? null : null;
    const { tags, objectives, stats, ...rest } = post;
    const s = statsOf(stats);
    const own = viewer?.userId === post.authorId;
    return {
      success: true,
      data: {
        ...rest,
        tags: tags.map((t) => t.tag.name),
        objectives: objectives.map((o) => ({ ...o.objective, relevance: o.relevance })),
        stats: { reactions: s.reactions, reactionsTotal: totalReactions(s), viewCount: s.viewCount, commentCount: s.commentCount },
        viewer: {
          reaction: myReaction,
          canEdit: own || ctx.isManager || ctx.isSiteAdmin,
          canModerate: ctx.isManager || ctx.isSiteAdmin,
          canComment: ctx.canWrite && !post.isLocked && post.status === PostStatus.published,
        },
      },
    };
  }

  // ── Escrita ────────────────────────────────────────────────────────────────

  private async resolveTags(tx: Prisma.TransactionClient, names: string[]) {
    if (!names.length) return [];
    await tx.tag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
    return tx.tag.findMany({ where: { name: { in: names } }, select: { tagId: true } });
  }

  private async validObjectives(tx: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return [];
    const found = await tx.learningObjective.findMany({ where: { objectiveId: { in: ids } }, select: { objectiveId: true } });
    if (found.length !== new Set(ids).size) throw new BadRequestException('Algum objectivo de aprendizagem não existe');
    return found;
  }

  private checkPrivileged(ctx: PostCtx, dto: { visibility?: PostVisibility; isPinned?: boolean; isLocked?: boolean }) {
    const mod = ctx.isManager || ctx.isSiteAdmin;
    if (dto.visibility === PostVisibility.restricted && !mod) throw new ForbiddenException('Apenas moderadores podem criar posts restritos');
    if (dto.isPinned !== undefined && dto.isPinned && !mod) throw new ForbiddenException('Apenas moderadores podem fixar posts');
    if (dto.isLocked !== undefined && !mod) throw new ForbiddenException('Apenas moderadores podem bloquear comentários');
  }

  async create(communityIdOrSlug: string, user: AuthUser, dto: CreatePostDto) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    this.access.assertCanWrite(ctx);
    this.checkPrivileged(ctx, dto);

    const postType = dto.postType ?? PostType.discussion;
    const status = dto.status === 'draft' ? PostStatus.draft : PostStatus.published;
    const visibility = dto.visibility ?? PostVisibility.public;

    const postId = await this.prisma.$transaction(async (tx) => {
      const tags = await this.resolveTags(tx, dto.tags ?? []);
      const objectives = await this.validObjectives(tx, dto.objectives ?? []);
      const post = await tx.communityPost.create({
        data: {
          communityId: ctx.community.communityId,
          authorId: user.userId,
          title: dto.title,
          content: dto.content,
          excerpt: dto.excerpt || makeExcerpt(dto.content),
          postType,
          difficultyLevel: postType === PostType.resource || postType === PostType.assignment ? dto.difficultyLevel : null,
          sourceUrl: dto.sourceUrl,
          isOriginalContent: dto.isOriginalContent ?? true,
          visibility,
          isPinned: dto.isPinned ?? false,
          status,
          tags: { create: tags.map((t) => ({ tagId: t.tagId })) },
          objectives: { create: objectives.map((o) => ({ objectiveId: o.objectiveId })) },
          attachments: { create: (dto.attachments ?? []).map((a) => this.attachmentData(a, user.userId)) },
        },
        select: { postId: true },
      });
      return post.postId;
    });

    if (status === PostStatus.published) await this.notifyPublished(ctx, postId, user.userId, dto.title, visibility);
    return this.getDetail(ctx.community.communityId, postId, user);
  }

  private attachmentData(a: AttachmentDto, uploadedById: string) {
    return {
      uploadedById,
      url: a.url,
      type: a.type,
      title: a.title || `Anexo ${a.type}`,
      description: a.description,
      metadata: (a.metadata ?? {}) as Prisma.InputJsonObject,
    };
  }

  private async notifyPublished(ctx: PostCtx, postId: string, authorId: string, title: string, visibility: PostVisibility) {
    if (visibility === PostVisibility.restricted) return;
    const members = await this.prisma.communityMember.findMany({
      where: { communityId: ctx.community.communityId, status: { in: MEMBER_STATUSES }, userId: { not: authorId } },
      select: { userId: true },
    });
    await this.notifications.notifyMany(members.map((m) => m.userId), NotificationType.NEW_COMMUNITY_POST, {
      title: 'Novo post',
      message: `Novo post em "${ctx.community.name}": ${title}`,
      relatedEntityId: postId,
      metadata: { communityId: ctx.community.communityId, postId },
    });
  }

  async update(communityIdOrSlug: string, postId: string, user: AuthUser, dto: UpdatePostDto) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    const post = await this.access.getPost(ctx, postId);
    const own = post.authorId === user.userId;
    const mod = ctx.isManager || ctx.isSiteAdmin;
    if (!own && !mod) throw new ForbiddenException('Você não tem permissão para editar este post');
    if (own && !mod) this.access.assertCanWrite(ctx); // silenciados/banidos não editam
    this.checkPrivileged(ctx, dto);
    if (!own && mod && (dto.title || dto.content || dto.excerpt || dto.attachments)) {
      throw new ForbiddenException('A moderação pode fixar, bloquear, arquivar ou mudar a visibilidade, mas não reescrever o post de outra pessoa');
    }
    if (post.status === PostStatus.published && dto.status === 'draft') throw new BadRequestException('Um post publicado não volta a rascunho (arquive-o)');

    const postType = dto.postType ?? post.postType;
    const rewrote = dto.title !== undefined || dto.content !== undefined;
    const history = Array.isArray(post.editHistory) ? (post.editHistory as Prisma.JsonArray) : [];

    await this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, postId);
      const data: Prisma.CommunityPostUpdateInput = {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content, excerpt: dto.excerpt || makeExcerpt(dto.content) }),
        ...(dto.excerpt !== undefined && dto.content === undefined && { excerpt: dto.excerpt }),
        ...(dto.postType !== undefined && { postType: dto.postType }),
        difficultyLevel: postType === PostType.resource || postType === PostType.assignment ? (dto.difficultyLevel ?? post.difficultyLevel) : null,
        ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl }),
        ...(dto.isOriginalContent !== undefined && { isOriginalContent: dto.isOriginalContent }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
        ...(dto.isLocked !== undefined && { isLocked: dto.isLocked }),
        ...(dto.status !== undefined && { status: dto.status as PostStatus }),
        ...(rewrote && {
          lastEditedAt: new Date(),
          editHistory: [...history, { editedAt: new Date().toISOString(), editedBy: user.userId, previousTitle: post.title, previousContent: post.content }].slice(-EDIT_HISTORY_MAX) as Prisma.InputJsonArray,
        }),
      };
      await tx.communityPost.update({ where: { postId }, data });

      if (dto.tags) {
        const tags = await this.resolveTags(tx, dto.tags);
        await tx.postTag.deleteMany({ where: { postId } });
        await tx.postTag.createMany({ data: tags.map((t) => ({ postId, tagId: t.tagId })) });
      }
      if (dto.objectives) {
        const objs = await this.validObjectives(tx, dto.objectives);
        await tx.postObjective.deleteMany({ where: { postId } });
        await tx.postObjective.createMany({ data: objs.map((o) => ({ postId, objectiveId: o.objectiveId })) });
      }
      if (dto.attachments) {
        await tx.postAttachment.deleteMany({ where: { postId } });
        await tx.postAttachment.createMany({ data: dto.attachments.map((a) => ({ postId, ...this.attachmentData(a, user.userId) })) });
      }
    });

    if (post.status !== PostStatus.published && dto.status === 'published') {
      await this.notifyPublished(ctx, postId, post.authorId, dto.title ?? post.title, dto.visibility ?? post.visibility);
    }
    return this.getDetail(ctx.community.communityId, postId, user);
  }

  async remove(communityIdOrSlug: string, postId: string, user: AuthUser) {
    const ctx = await this.access.context(communityIdOrSlug, user);
    const post = await this.access.getPost(ctx, postId);
    const own = post.authorId === user.userId;
    if (!own && !ctx.isManager && !ctx.isSiteAdmin) throw new ForbiddenException('Você não tem permissão para excluir este post');

    await this.prisma.communityPost.update({
      where: { postId },
      data: {
        status: PostStatus.deleted,
        isPinned: false,
        metadata: { ...((post.metadata as object) ?? {}), deletedBy: user.userId, deletionReason: own ? 'author' : 'moderation', deletedAt: new Date().toISOString() },
      },
    });
    if (!own) {
      await this.notifications.notify(post.authorId, NotificationType.POST_DELETED, {
        title: 'Post removido',
        message: `O seu post "${post.title}" foi removido pela moderação de "${ctx.community.name}".`,
        relatedEntityId: ctx.community.communityId,
      });
    }
    return { success: true, message: 'Post excluído com sucesso' };
  }
}
