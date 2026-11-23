import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Community, CommunityPost, CommunityStatus, PostReactionType, PostStatus, PostVisibility, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { can, communityWhere, isMemberOf, loadMembership, MembershipInfo } from '../community-access';

export interface PostCtx {
  community: Community;
  viewer?: AuthUser;
  membership: MembershipInfo | null;
  /** membro (activo ou silenciado) ou admin do site */
  isMember: boolean;
  /** pode escrever: membro activo ou admin do site */
  canWrite: boolean;
  /** managePosts */
  isManager: boolean;
  isSiteAdmin: boolean;
}

export const POST_AUTHOR_SELECT = { userId: true, username: true, avatarUrl: true } as const;

/** Acesso comum a posts, comentários e reacções: visibilidade, permissões, bloqueio e contadores. */
@Injectable()
export class PostAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Comunidade privada => 404 a quem não pertence (não revela que existe). */
  async context(idOrSlug: string, viewer?: AuthUser): Promise<PostCtx> {
    const community = await this.prisma.community.findFirst({ where: communityWhere(idOrSlug) });
    if (!community) throw new NotFoundException('Comunidade não encontrada');
    const membership = viewer ? await loadMembership(this.prisma, community.communityId, viewer.userId) : null;
    const isSiteAdmin = viewer?.role === UserRole.admin;
    const isMember = isMemberOf(membership) || isSiteAdmin;
    if (!community.isPublic && !isMember) throw new NotFoundException('Comunidade não encontrada');
    return {
      community,
      viewer,
      membership,
      isMember,
      canWrite: membership?.status === 'active' || isSiteAdmin,
      isManager: can(viewer, membership, 'managePosts'),
      isSiteAdmin,
    };
  }

  assertCanWrite(ctx: PostCtx) {
    if (ctx.community.status !== CommunityStatus.active) throw new BadRequestException('Esta comunidade está arquivada');
    if (!ctx.canWrite) {
      throw new ForbiddenException(
        ctx.membership?.status === 'muted' ? 'Você está silenciado nesta comunidade' : 'Você precisa ser membro ativo para participar',
      );
    }
  }

  /** Filtro de visibilidade para listagens (posts publicados). */
  visibilityWhere(ctx: PostCtx): Prisma.CommunityPostWhereInput {
    if (ctx.isManager || ctx.isSiteAdmin) return {};
    const mine = ctx.viewer?.userId;
    if (ctx.isMember) {
      return { OR: [{ visibility: { in: [PostVisibility.public, PostVisibility.members] } }, ...(mine ? [{ authorId: mine }] : [])] };
    }
    return { visibility: PostVisibility.public };
  }

  canSee(ctx: PostCtx, post: { visibility: PostVisibility; authorId: string; status: PostStatus }): boolean {
    if (post.status === PostStatus.deleted) return false;
    const own = !!ctx.viewer && post.authorId === ctx.viewer.userId;
    if (post.status !== PostStatus.published) return own || ctx.isManager || ctx.isSiteAdmin; // rascunho/arquivado: autor e moderação
    if (own || ctx.isManager || ctx.isSiteAdmin) return true;
    if (post.visibility === PostVisibility.public) return true;
    if (post.visibility === PostVisibility.members) return ctx.isMember;
    return false; // restricted
  }

  async getPost(ctx: PostCtx, postId: string): Promise<CommunityPost> {
    const post = await this.prisma.communityPost.findFirst({ where: { postId, communityId: ctx.community.communityId } });
    if (!post || !this.canSee(ctx, post)) throw new NotFoundException('Post não encontrado ou não disponível');
    return post;
  }

  /** Post publicado onde se pode interagir (comentar/reagir). */
  async getInteractivePost(ctx: PostCtx, postId: string): Promise<CommunityPost> {
    const post = await this.getPost(ctx, postId);
    if (post.status !== PostStatus.published) throw new NotFoundException('Post não encontrado ou não disponível');
    return post;
  }

  /** Serializa escritas concorrentes sobre os contadores do post. */
  lock(tx: Prisma.TransactionClient, postId: string) {
    return tx.$queryRaw`SELECT "postId" FROM community_posts WHERE "postId" = ${postId}::uuid FOR UPDATE`;
  }

  /** Recalcula reacções e nº de comentários a partir das tabelas (sem desvios); preserva viewCount. */
  recomputeStats(tx: Prisma.TransactionClient | PrismaService, postId: string) {
    const reactions = Prisma.join(
      Object.values(PostReactionType).flatMap((t) => [
        Prisma.sql`${t}::text`,
        Prisma.sql`(SELECT count(*) FROM post_reactions r WHERE r."postId" = p."postId" AND r.type::text = ${t})`,
      ]),
    );
    return tx.$executeRaw`
      UPDATE community_posts p SET stats = jsonb_build_object(
        'reactions', jsonb_build_object(${reactions}),
        'viewCount', COALESCE(p.stats->'viewCount', '0'::jsonb),
        'commentCount', (SELECT count(*) FROM post_comments c WHERE c."postId" = p."postId" AND c.status = 'active')
      ) WHERE p."postId" = ${postId}::uuid`;
  }
}
