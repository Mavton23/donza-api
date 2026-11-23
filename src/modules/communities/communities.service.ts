import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CommunityBaseRole,
  CommunityMemberStatus,
  CommunityStatus,
  NotificationType,
  PostStatus,
  Prisma,
  StudyGroupPrivacy,
  StudyGroupStatus,
  UserRole,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  communityWhere,
  can,
  isMemberOf,
  loadMembership,
  MEMBER_STATUSES,
  requirePermission,
  slugify,
} from './community-access';
import { CreateCommunityDto, ListCommunitiesQueryDto, UpdateCommunityDto } from './dto/community.dto';

type Files = { coverImage?: Express.Multer.File[]; thumbnailImage?: Express.Multer.File[] } | undefined;

const CREATOR_SELECT = { userId: true, username: true, avatarUrl: true, role: true } as const;
const RULE_KEYS = ['guidelines', 'allowedContent', 'moderationPolicy'] as const;

/** Só as 3 secções conhecidas, como texto. (O conteúdo pode ser HTML: o frontend deve sanitizar ao renderizar.) */
function cleanRules(rules: Record<string, unknown>): Prisma.InputJsonObject {
  const bad = Object.keys(rules).filter((k) => !(RULE_KEYS as readonly string[]).includes(k));
  if (bad.length) throw new BadRequestException(`Chaves de regras inválidas: ${bad.join(', ')}. Esperado: ${RULE_KEYS.join(', ')}`);
  const out: Record<string, string> = {};
  for (const k of RULE_KEYS) {
    const v = rules[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > 10_000) throw new BadRequestException(`A regra "${k}" deve ser texto com até 10000 caracteres`);
    out[k] = v;
  }
  return out;
}

function cleanSocialLinks(links: Record<string, unknown>): Prisma.InputJsonObject {
  const entries = Object.entries(links);
  if (entries.length > 10) throw new BadRequestException('No máximo 10 links sociais');
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,30}$/.test(k)) throw new BadRequestException(`Nome de link social inválido: ${k}`);
    if (typeof v !== 'string' || v.length > 300 || !/^https?:\/\//i.test(v)) {
      throw new BadRequestException(`O link "${k}" deve ser um URL http(s) com até 300 caracteres`);
    }
    out[k] = v;
  }
  return out;
}

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Listagens ──────────────────────────────────────────────────────────────

  private counts() {
    return {
      members: { where: { status: { in: MEMBER_STATUSES } } },
      posts: { where: { status: PostStatus.published } },
      studyGroups: { where: { status: StudyGroupStatus.active, privacy: StudyGroupPrivacy.public } },
    } satisfies Prisma.CommunityCountOutputTypeSelect;
  }

  private shape(
    c: Prisma.CommunityGetPayload<{ include: { creator: { select: typeof CREATOR_SELECT }; _count: { select: ReturnType<CommunitiesService['counts']> } } }>,
    mine?: { role: CommunityBaseRole; status: CommunityMemberStatus } | null,
  ) {
    const { _count, deletedAt: _d, analytics: _a, ...rest } = c;
    return {
      ...rest,
      stats: { members: _count.members, posts: _count.posts, studyGroups: _count.studyGroups },
      // undefined = visitante anónimo (sem campo); null = autenticado sem vínculo
      ...(mine !== undefined && {
        viewer: { isMember: !!mine && (mine.status === 'active' || mine.status === 'muted'), role: mine?.role ?? null, status: mine?.status ?? null },
      }),
    };
  }

  private async page(where: Prisma.CommunityWhereInput, q: { page: number; limit: number }, orderBy: Prisma.CommunityOrderByWithRelationInput[], viewerId?: string) {
    const [rows, total] = await Promise.all([
      this.prisma.community.findMany({
        where,
        orderBy,
        skip: skipOf(q),
        take: q.limit,
        include: { creator: { select: CREATOR_SELECT }, _count: { select: this.counts() } },
      }),
      this.prisma.community.count({ where }),
    ]);
    const mine = viewerId
      ? new Map(
          (
            await this.prisma.communityMember.findMany({
              where: { userId: viewerId, communityId: { in: rows.map((r) => r.communityId) } },
              select: { communityId: true, role: true, status: true },
            })
          ).map((m) => [m.communityId, m]),
        )
      : null;
    return paginated(
      rows.map((r) => this.shape(r, mine ? (mine.get(r.communityId) ?? null) : undefined)),
      total,
      q,
    );
  }

  private order(sort?: string): Prisma.CommunityOrderByWithRelationInput[] {
    if (sort === 'popular') return [{ members: { _count: 'desc' } }, { createdAt: 'desc' }];
    if (sort === 'name') return [{ name: 'asc' }];
    return [{ createdAt: 'desc' }];
  }

  async list(q: ListCommunitiesQueryDto, viewer?: AuthUser) {
    const mineClause: Prisma.CommunityWhereInput | null = viewer
      ? { OR: [{ creatorId: viewer.userId }, { members: { some: { userId: viewer.userId, status: { in: MEMBER_STATUSES } } } }] }
      : null;
    const visibility = q.visibility ?? 'all';
    const vis: Prisma.CommunityWhereInput =
      visibility === 'public'
        ? { isPublic: true }
        : visibility === 'private'
          ? mineClause ? { AND: [{ isPublic: false }, mineClause] } : { communityId: { in: [] } }
          : mineClause ? { OR: [{ isPublic: true }, { AND: [{ isPublic: false }, mineClause] }] } : { isPublic: true };

    const where: Prisma.CommunityWhereInput = {
      status: CommunityStatus.active,
      deletedAt: null,
      AND: [
        vis,
        ...(q.search
          ? [{ OR: [
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { description: { contains: q.search, mode: 'insensitive' as const } },
              { shortDescription: { contains: q.search, mode: 'insensitive' as const } },
            ] }]
          : []),
        ...(q.tag ? [{ tags: { has: q.tag.toLowerCase() } }] : []),
      ],
    };
    return this.page(where, q, this.order(q.sort), viewer?.userId);
  }

  mine(userId: string, q: ListCommunitiesQueryDto) {
    return this.page(
      { deletedAt: null, status: { not: CommunityStatus.suspended }, members: { some: { userId, status: { in: MEMBER_STATUSES } } } },
      q,
      this.order(q.sort),
      userId,
    );
  }

  // ── Detalhe ────────────────────────────────────────────────────────────────

  async getDetail(idOrSlug: string, viewer?: AuthUser) {
    const community = await this.prisma.community.findFirst({
      where: communityWhere(idOrSlug),
      include: { creator: { select: CREATOR_SELECT }, _count: { select: this.counts() } },
    });
    const membership = community && viewer ? await loadMembership(this.prisma, community.communityId, viewer.userId) : null;
    const member = isMemberOf(membership);
    // Privada => 404 para quem não pertence (não revela que existe). Convidados vêem-na para poderem aceitar.
    let invited = false;
    if (community && !community.isPublic && !member && viewer?.role !== UserRole.admin) {
      invited = !!viewer && (await this.pendingInvite(community.communityId, viewer.userId));
      if (!invited) throw new NotFoundException('Comunidade não encontrada');
    }
    if (!community) throw new NotFoundException('Comunidade não encontrada');

    const [recentMembers, studyGroups, posts] = await Promise.all([
      this.prisma.communityMember.findMany({
        where: { communityId: community.communityId, status: { in: MEMBER_STATUSES } },
        orderBy: { joinedAt: 'desc' },
        take: 8,
        select: { role: true, joinedAt: true, user: { select: { userId: true, username: true, avatarUrl: true } } },
      }),
      this.prisma.studyGroup.findMany({
        where: { communityId: community.communityId, status: StudyGroupStatus.active, privacy: StudyGroupPrivacy.public },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { groupId: true, name: true, description: true, _count: { select: { members: true } } },
      }),
      this.prisma.communityPost.findMany({
        where: {
          communityId: community.communityId,
          status: PostStatus.published,
          ...(member || viewer?.role === UserRole.admin ? {} : { visibility: 'public' }),
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: { postId: true, title: true, excerpt: true, isPinned: true, createdAt: true, author: { select: { userId: true, username: true, avatarUrl: true } } },
      }),
    ]);

    const { _count, deletedAt: _d, analytics: _a, ...rest } = community;
    return {
      success: true,
      data: {
        ...rest,
        stats: { members: _count.members, posts: _count.posts, studyGroups: _count.studyGroups },
        recentActivity: {
          members: recentMembers.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })),
          studyGroups: studyGroups.map(({ _count: c, ...g }) => ({ ...g, membersCount: c.members })),
          posts,
        },
        viewer: {
          isMember: member,
          role: membership?.role ?? null,
          status: membership?.status ?? null,
          joinedAt: membership?.joinedAt ?? null,
          hasPendingRequest: membership?.status === CommunityMemberStatus.pending,
          hasInvite: invited || (!!viewer && !member && (await this.pendingInvite(community.communityId, viewer.userId))),
          canEdit: !!viewer && can(viewer, membership, 'editCommunity'),
        },
      },
    };
  }

  /** Convite pendente e não expirado para este utilizador (por userId, ou email verificado). */
  async pendingInvite(communityId: string, userId: string) {
    const me = await this.prisma.user.findUnique({ where: { userId }, select: { email: true, isVerified: true } });
    if (!me) return false;
    const n = await this.prisma.communityInvite.count({
      where: {
        communityId,
        status: 'pending',
        expiresAt: { gt: new Date() },
        OR: [{ userId }, ...(me.isVerified ? [{ email: { equals: me.email, mode: 'insensitive' as const } }] : [])],
      },
    });
    return n > 0;
  }

  // ── Criar ──────────────────────────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateCommunityDto, files: Files) {
    const name = dto.name;
    if (await this.prisma.community.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { communityId: true } })) {
      throw new ConflictException('Já existe uma comunidade com este nome');
    }
    let slug = dto.slug ?? slugify(name);
    if (await this.prisma.community.findUnique({ where: { slug }, select: { communityId: true } })) {
      if (dto.slug) throw new ConflictException('Este URL de comunidade já está em uso');
      slug = `${slug}-${randomBytes(3).toString('hex')}`;
    }

    const uploaded: { key: string }[] = [];
    try {
      const cover = files?.coverImage?.[0] && (await this.storage.upload(files.coverImage[0], { folder: 'communities/cover', resourceType: 'image' }));
      if (cover) uploaded.push(cover);
      const thumb = files?.thumbnailImage?.[0] && (await this.storage.upload(files.thumbnailImage[0], { folder: 'communities/thumbnail', resourceType: 'image' }));
      if (thumb) uploaded.push(thumb);

      const community = await this.prisma.$transaction(async (tx) => {
        const c = await tx.community.create({
          data: {
            creatorId: user.userId,
            name,
            slug,
            description: dto.description,
            shortDescription: dto.shortDescription,
            isPublic: dto.isPublic ?? true,
            membershipType: dto.membershipType ?? 'open',
            tags: dto.tags ?? [],
            socialLinks: cleanSocialLinks(dto.socialLinks ?? {}),
            rules: cleanRules(dto.rules ?? {}),
            coverImage: cover?.url,
            thumbnailImage: thumb?.url,
          },
        });
        await tx.communityMember.create({ data: { communityId: c.communityId, userId: user.userId, role: 'admin', status: 'active' } });
        return c;
      });

      await this.notifications.notify(user.userId, NotificationType.COMMUNITY_CREATED, {
        title: 'Comunidade criada',
        message: `A comunidade "${community.name}" foi criada.`,
        relatedEntityId: community.communityId,
      });
      return {
        success: true,
        data: { communityId: community.communityId, name: community.name, slug: community.slug, coverImage: community.coverImage, thumbnailImage: community.thumbnailImage },
      };
    } catch (err) {
      await Promise.all(uploaded.map((u) => this.storage.remove(u.key, { resourceType: 'image' })));
      throw err;
    }
  }

  // ── Editar / apagar ────────────────────────────────────────────────────────

  async update(user: AuthUser, communityId: string, dto: UpdateCommunityDto, files: Files) {
    const { community, membership } = await requirePermission(this.prisma, user, communityId, 'editCommunity');

    if (dto.status && community.status === CommunityStatus.suspended && user.role !== UserRole.admin) {
      throw new ForbiddenException('Comunidade suspensa pela administração');
    }
    if (dto.name && dto.name.toLowerCase() !== community.name.toLowerCase()) {
      const clash = await this.prisma.community.findFirst({ where: { name: { equals: dto.name, mode: 'insensitive' }, NOT: { communityId } }, select: { communityId: true } });
      if (clash) throw new ConflictException('Já existe uma comunidade com este nome');
    }

    const uploaded: { key: string }[] = [];
    try {
      const cover = files?.coverImage?.[0] && (await this.storage.upload(files.coverImage[0], { folder: 'communities/cover', resourceType: 'image' }));
      if (cover) uploaded.push(cover);
      const thumb = files?.thumbnailImage?.[0] && (await this.storage.upload(files.thumbnailImage[0], { folder: 'communities/thumbnail', resourceType: 'image' }));
      if (thumb) uploaded.push(thumb);

      const { removeCover, removeThumbnail, rules, socialLinks, status, ...plain } = dto;
      const data: Prisma.CommunityUpdateInput = {
        ...plain,
        ...(rules && { rules: cleanRules(rules) }),
        ...(socialLinks && { socialLinks: cleanSocialLinks(socialLinks) }),
        ...(status && { status }),
        ...(cover ? { coverImage: cover.url } : removeCover ? { coverImage: null } : {}),
        ...(thumb ? { thumbnailImage: thumb.url } : removeThumbnail ? { thumbnailImage: null } : {}),
      };
      const updated = await this.prisma.community.update({ where: { communityId }, data });

      if (cover || removeCover) await this.storage.removeByUrl(community.coverImage);
      if (thumb || removeThumbnail) await this.storage.removeByUrl(community.thumbnailImage);

      const sensitive = ['isPublic', 'membershipType', 'rules', 'status'].filter((k) => dto[k as keyof UpdateCommunityDto] !== undefined);
      if (sensitive.length) {
        const ids = (await this.prisma.communityMember.findMany({ where: { communityId, status: { in: MEMBER_STATUSES }, userId: { not: user.userId } }, select: { userId: true } })).map((m) => m.userId);
        await this.notifications.notifyMany(ids, NotificationType.COMMUNITY_UPDATED, {
          title: 'Comunidade actualizada',
          message: `A comunidade "${updated.name}" actualizou as suas ${sensitive.includes('rules') ? 'regras' : 'definições'}.`,
          relatedEntityId: communityId,
        });
      }
      void membership;
      const { deletedAt: _d, analytics: _a, ...out } = updated;
      return { success: true, message: 'Comunidade atualizada com sucesso', data: out };
    } catch (err) {
      await Promise.all(uploaded.map((u) => this.storage.remove(u.key, { resourceType: 'image' })));
      throw err;
    }
  }

  /** Eliminação lógica (deletedAt): posts e membros ficam preservados, a comunidade deixa de aparecer. */
  async remove(user: AuthUser, communityId: string) {
    const community = await this.prisma.community.findFirst({ where: { communityId, deletedAt: null } });
    if (!community) throw new NotFoundException('Comunidade não encontrada');
    if (community.creatorId !== user.userId && user.role !== UserRole.admin) {
      throw new ForbiddenException('Apenas o criador pode eliminar esta comunidade');
    }
    const ids = (await this.prisma.communityMember.findMany({ where: { communityId, status: { in: MEMBER_STATUSES }, userId: { not: user.userId } }, select: { userId: true } })).map((m) => m.userId);
    await this.prisma.community.update({ where: { communityId }, data: { deletedAt: new Date(), status: CommunityStatus.archived } });
    await this.notifications.notifyMany(ids, NotificationType.COMMUNITY_UPDATED, {
      title: 'Comunidade eliminada',
      message: `A comunidade "${community.name}" foi eliminada.`,
    });
    return { success: true, message: 'Comunidade eliminada' };
  }
}
