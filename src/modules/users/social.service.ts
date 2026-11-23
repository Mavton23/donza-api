import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RelationshipType, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, PaginationQueryDto, skipOf } from '@/common/utils/pagination';
import { displayName } from '../courses/course-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchUsersQueryDto, SetPrivacyDto } from './dto/social.dto';

const CARD = { userId: true, username: true, fullName: true, institutionName: true, avatarUrl: true, role: true, bio: true } as const;
type Card = Prisma.UserGetPayload<{ select: typeof CARD }>;
const card = ({ institutionName, fullName, ...u }: Card & { fullName: string | null }) => ({ ...u, name: displayName({ ...u, institutionName, fullName }) });
const FOLLOW = { relationshipType: RelationshipType.follow, status: 'accepted' as const };
const REQUEST_COOLDOWN_MS = 7 * 86_400_000; // após recusa, novo pedido só notifica passados 7 dias
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class SocialService {
  private publicStatsCache?: { at: number; data: unknown };

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  // ── Seguir ───────────────────────────────────────────────────────────────

  private async target(userId: string) {
    const t = await this.prisma.user.findUnique({ where: { userId }, select: { userId: true, role: true, status: true, isPrivate: true, username: true, fullName: true, institutionName: true } });
    if (!t || t.status !== UserStatus.approved || t.role === UserRole.admin) throw new NotFoundException({ message: 'Utilizador não encontrado', code: 'USER_NOT_FOUND' });
    return t;
  }

  async follow(user: AuthUser, targetId: string) {
    if (targetId === user.userId) throw new BadRequestException({ message: 'Não pode seguir-se a si próprio', code: 'SELF_FOLLOW' });
    const t = await this.target(targetId);
    const blocked = await this.prisma.userRelationship.findFirst({
      where: { relationshipType: RelationshipType.blocked, OR: [{ userId: user.userId, relatedUserId: targetId }, { userId: targetId, relatedUserId: user.userId }] }, select: { relationId: true },
    });
    if (blocked) throw new ForbiddenException({ message: 'Não é possível seguir este utilizador', code: 'BLOCKED' });

    const key = { userId: user.userId, relatedUserId: targetId, relationshipType: RelationshipType.follow };
    const me = () => this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true, fullName: true, institutionName: true, role: true } });
    const status = t.isPrivate ? 'pending' : 'accepted';

    let row = await this.prisma.userRelationship.findFirst({ where: key, select: { relationId: true, status: true, updatedAt: true } });
    if (!row) {
      try {
        await this.prisma.userRelationship.create({ data: { ...key, status } });
        const m = await me();
        const name = m ? displayName(m) : 'Alguém';
        void this.notifications.notify(t.userId, t.isPrivate ? NotificationType.FOLLOW_REQUEST : NotificationType.NEW_FOLLOWER, {
          title: t.isPrivate ? 'Pedido para seguir' : 'Novo seguidor',
          message: t.isPrivate ? `${name} pediu para seguir o seu perfil.` : `${name} começou a seguir o seu perfil.`, relatedEntityId: user.userId,
        });
        return this.followResult(targetId, status, true);
      } catch (e) {
        if (!isP2002(e)) throw e; // pedido simultâneo: segue como idempotente
        row = await this.prisma.userRelationship.findFirst({ where: key, select: { relationId: true, status: true, updatedAt: true } });
        if (!row) throw e;
      }
    }

    if (row.status === 'accepted') return this.followResult(targetId, 'accepted', false);
    if (row.status === 'pending' && !t.isPrivate) {
      // o perfil passou a público entretanto (normalmente já foi aceite em lote)
      await this.prisma.userRelationship.updateMany({ where: { relationId: row.relationId, status: 'pending' }, data: { status: 'accepted' } });
      return this.followResult(targetId, 'accepted', false);
    }
    if (row.status === 'pending') return this.followResult(targetId, 'pending', false);
    if (row.status === 'rejected') {
      // Recusado: o requerente continua a ver "pedido enviado" (não revela a recusa) e não volta a notificar durante o período de espera.
      if (!t.isPrivate) {
        await this.prisma.userRelationship.updateMany({ where: { relationId: row.relationId, status: 'rejected' }, data: { status: 'accepted' } });
        return this.followResult(targetId, 'accepted', true);
      }
      if (Date.now() - row.updatedAt.getTime() < REQUEST_COOLDOWN_MS) return this.followResult(targetId, 'pending', false);
      const { count } = await this.prisma.userRelationship.updateMany({ where: { relationId: row.relationId, status: 'rejected' }, data: { status: 'pending' } });
      if (count) {
        const m = await me();
        void this.notifications.notify(t.userId, NotificationType.FOLLOW_REQUEST, {
          title: 'Pedido para seguir', message: `${m ? displayName(m) : 'Alguém'} pediu para seguir o seu perfil.`, relatedEntityId: user.userId,
        });
      }
      return this.followResult(targetId, 'pending', !!count);
    }
    throw new ForbiddenException({ message: 'Não é possível seguir este utilizador', code: 'BLOCKED' });
  }

  private async followResult(targetId: string, status: 'accepted' | 'pending', created: boolean) {
    return { success: true, data: { isFollowing: status === 'accepted', hasRequested: status === 'pending', created, followersCount: await this.countFollowers(targetId) } };
  }

  async unfollow(user: AuthUser, targetId: string) {
    const { count } = await this.prisma.userRelationship.deleteMany({ where: { userId: user.userId, relatedUserId: targetId, relationshipType: RelationshipType.follow, status: { in: ['accepted', 'pending'] } } }); // 'rejected' fica, para não contornar a espera
    return { success: true, data: { isFollowing: false, hasRequested: false, removed: count > 0, followersCount: await this.countFollowers(targetId) } };
  }

  private countFollowers(userId: string) { return this.prisma.userRelationship.count({ where: { relatedUserId: userId, ...FOLLOW } }); }
  private countFollowing(userId: string) { return this.prisma.userRelationship.count({ where: { userId, ...FOLLOW } }); }

  async followStatus(user: AuthUser, targetId: string) {
    await this.target(targetId);
    const [mine, requested, theirs, followers, following] = await Promise.all([
      this.prisma.userRelationship.count({ where: { userId: user.userId, relatedUserId: targetId, ...FOLLOW } }),
      this.prisma.userRelationship.count({ where: { userId: user.userId, relatedUserId: targetId, relationshipType: RelationshipType.follow, status: { in: ['pending', 'rejected'] } } }),
      this.prisma.userRelationship.count({ where: { userId: targetId, relatedUserId: user.userId, ...FOLLOW } }),
      this.countFollowers(targetId), this.countFollowing(targetId),
    ]);
    return { success: true, data: { isFollowing: mine > 0, hasRequested: requested > 0, followsYou: theirs > 0, followersCount: followers, followingCount: following } };
  }

  /** Listas de um perfil privado só são visíveis ao próprio, a admins e a quem o segue. */
  private async assertCanSeeLists(viewer: AuthUser, userId: string) {
    const t = await this.target(userId);
    if (!t.isPrivate || viewer.userId === userId || viewer.role === UserRole.admin) return;
    if (await this.prisma.userRelationship.count({ where: { userId: viewer.userId, relatedUserId: userId, ...FOLLOW } })) return;
    throw new ForbiddenException({ message: 'Este perfil é privado', code: 'PRIVATE_PROFILE' });
  }

  private async followList(viewer: AuthUser, userId: string, q: PaginationQueryDto, dir: 'followers' | 'following') {
    await this.assertCanSeeLists(viewer, userId);
    const where: Prisma.UserRelationshipWhereInput = dir === 'followers' ? { relatedUserId: userId, ...FOLLOW, initiator: { status: UserStatus.approved } } : { userId, ...FOLLOW, target: { status: UserStatus.approved } };
    const [rows, total] = await Promise.all([
      this.prisma.userRelationship.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { createdAt: true, initiator: { select: CARD }, target: { select: CARD } },
      }),
      this.prisma.userRelationship.count({ where }),
    ]);
    const people = rows.map((r) => ({ ...card(dir === 'followers' ? r.initiator : r.target), since: r.createdAt }));
    const mine = people.length ? await this.prisma.userRelationship.findMany({ where: { userId: viewer.userId, relatedUserId: { in: people.map((p) => p.userId) }, ...FOLLOW }, select: { relatedUserId: true } }) : [];
    const set = new Set(mine.map((m) => m.relatedUserId));
    return paginated(people.map((p) => ({ ...p, viewerFollows: set.has(p.userId) })), total, q);
  }

  followers(viewer: AuthUser, userId: string, q: PaginationQueryDto) { return this.followList(viewer, userId, q, 'followers'); }
  following(viewer: AuthUser, userId: string, q: PaginationQueryDto) { return this.followList(viewer, userId, q, 'following'); }

  // ── Privacidade e pedidos de seguimento ──────────────────────────────────

  /** Tornar o perfil público aceita de uma vez todos os pedidos pendentes (e recusados). */
  async setPrivacy(user: AuthUser, dto: SetPrivacyDto) {
    const accepted = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId: user.userId }, data: { isPrivate: dto.isPrivate } });
      if (dto.isPrivate) return 0;
      const { count } = await tx.userRelationship.updateMany({
        where: { relatedUserId: user.userId, relationshipType: RelationshipType.follow, status: { in: ['pending', 'rejected'] } }, data: { status: 'accepted' },
      });
      return count;
    });
    return { success: true, data: { isPrivate: dto.isPrivate, acceptedRequests: accepted } };
  }

  async incomingRequests(user: AuthUser, q: PaginationQueryDto) {
    const where: Prisma.UserRelationshipWhereInput = { relatedUserId: user.userId, relationshipType: RelationshipType.follow, status: 'pending', initiator: { status: UserStatus.approved } };
    const [rows, total] = await Promise.all([
      this.prisma.userRelationship.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: { createdAt: true, initiator: { select: CARD } } }),
      this.prisma.userRelationship.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...card(r.initiator), requestedAt: r.createdAt })), total, q);
  }

  /** Pedidos que enviei e ainda aguardam (os recusados aparecem como pendentes, tal como no resto da API). */
  async sentRequests(user: AuthUser, q: PaginationQueryDto) {
    const where: Prisma.UserRelationshipWhereInput = { userId: user.userId, relationshipType: RelationshipType.follow, status: { in: ['pending', 'rejected'] }, target: { status: UserStatus.approved } };
    const [rows, total] = await Promise.all([
      this.prisma.userRelationship.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: { createdAt: true, target: { select: CARD } } }),
      this.prisma.userRelationship.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...card(r.target), requestedAt: r.createdAt })), total, q);
  }

  private async decide(user: AuthUser, requesterId: string, status: 'accepted' | 'rejected') {
    const { count } = await this.prisma.userRelationship.updateMany({
      where: { userId: requesterId, relatedUserId: user.userId, relationshipType: RelationshipType.follow, status: 'pending' }, data: { status },
    });
    if (!count) throw new NotFoundException({ message: 'Pedido não encontrado', code: 'REQUEST_NOT_FOUND' });
    if (status === 'accepted') {
      const me = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true, fullName: true, institutionName: true, role: true } });
      void this.notifications.notify(requesterId, NotificationType.FOLLOW_REQUEST_ACCEPTED, {
        title: 'Pedido aceite', message: `${me ? displayName(me) : 'Alguém'} aceitou o seu pedido para seguir.`, relatedEntityId: user.userId,
      });
    }
    return { success: true, data: { status, followersCount: await this.countFollowers(user.userId) } };
  }

  acceptRequest(user: AuthUser, requesterId: string) { return this.decide(user, requesterId, 'accepted'); }
  declineRequest(user: AuthUser, requesterId: string) { return this.decide(user, requesterId, 'rejected'); }

  /** Remover um seguidor (útil em perfis privados). Não notifica. */
  async removeFollower(user: AuthUser, followerId: string) {
    const { count } = await this.prisma.userRelationship.deleteMany({ where: { userId: followerId, relatedUserId: user.userId, ...FOLLOW } });
    return { success: true, data: { removed: count > 0, followersCount: await this.countFollowers(user.userId) } };
  }

  // ── Perfis ───────────────────────────────────────────────────────────────

  /** O meu perfil completo (sem segredos) + contagens. */
  async me(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { userId: user.userId } });
    const { password, verificationToken, passwordResetToken, passwordResetExpires, ...safe } = u; // eslint-disable-line @typescript-eslint/no-unused-vars
    const [followers, following] = await Promise.all([this.countFollowers(user.userId), this.countFollowing(user.userId)]);
    return { success: true, data: { ...safe, followersCount: followers, followingCount: following } };
  }

  async profile(viewer: AuthUser, where: { userId: string } | { username: string }) {
    const u = await this.prisma.user.findUnique({
      where,
      select: {
        ...CARD, status: true, isPrivate: true, interests: true, expertise: true, educationLevel: true, socialMedia: true, createdAt: true,
        teachingExperience: true, institutionType: true, website: true, academicPrograms: true, yearFounded: true, accreditation: true,
      },
    });
    const self = !!u && u.userId === viewer.userId;
    if (!u || (u.status !== UserStatus.approved && !self && viewer.role !== UserRole.admin) || (u.role === UserRole.admin && !self && viewer.role !== UserRole.admin)) {
      throw new NotFoundException({ message: 'Utilizador não encontrado', code: 'USER_NOT_FOUND' });
    }
    const [followers, following, isFollowing, followsYou, requested] = await Promise.all([
      this.countFollowers(u.userId), this.countFollowing(u.userId),
      this.prisma.userRelationship.count({ where: { userId: viewer.userId, relatedUserId: u.userId, ...FOLLOW } }),
      this.prisma.userRelationship.count({ where: { userId: u.userId, relatedUserId: viewer.userId, ...FOLLOW } }),
      this.prisma.userRelationship.count({ where: { userId: viewer.userId, relatedUserId: u.userId, relationshipType: RelationshipType.follow, status: { in: ['pending', 'rejected'] } } }),
    ]);
    const viewerInfo = { isSelf: self, isFollowing: isFollowing > 0, hasRequested: requested > 0, followsYou: followsYou > 0 };
    const base = { ...card(u), followersCount: followers, followingCount: following, viewer: viewerInfo };
    if (u.isPrivate && !self && viewer.role !== UserRole.admin && !viewerInfo.isFollowing) {
      const { bio, ...minimal } = base; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { success: true, data: { ...minimal, isPrivate: true } };
    }

    const extra: Record<string, unknown> = {};
    if (u.role === UserRole.instructor || u.role === UserRole.institution) {
      const courseWhere: Prisma.CourseWhereInput = { status: 'published', isPublic: true, ...(u.role === UserRole.instructor ? { instructorId: u.userId } : { OR: [{ organizerId: u.userId }, { instructorId: u.userId }] }) };
      const [coursesCount, students, rating] = await Promise.all([
        this.prisma.course.count({ where: courseWhere }),
        this.prisma.enrollment.count({ where: { status: { not: 'canceled' }, course: courseWhere } }),
        this.prisma.course.aggregate({ where: { ...courseWhere, ratingCount: { gt: 0 } }, _sum: { ratingCount: true } }),
      ]);
      const weighted = rating._sum.ratingCount
        ? Number((await this.prisma.$queryRaw<{ avg: number }[]>`SELECT (SUM("ratingAverage" * "ratingCount") / NULLIF(SUM("ratingCount"), 0))::float AS avg FROM courses WHERE "ratingCount" > 0 AND "status" = 'published' AND "isPublic" = true AND ${u.role === UserRole.instructor ? Prisma.sql`"instructorId" = ${u.userId}::uuid` : Prisma.sql`("organizerId" = ${u.userId}::uuid OR "instructorId" = ${u.userId}::uuid)`}`)[0]?.avg ?? 0)
        : 0;
      Object.assign(extra, { coursesCount, studentsCount: students, rating: { average: Math.round(weighted * 10) / 10, count: rating._sum.ratingCount ?? 0 } });
    }
    if (u.role === UserRole.instructor) Object.assign(extra, { teachingExperience: u.teachingExperience });
    if (u.role === UserRole.institution) {
      Object.assign(extra, {
        institutionType: u.institutionType, website: u.website, academicPrograms: u.academicPrograms, yearFounded: u.yearFounded, accreditation: u.accreditation,
        instructorsCount: await this.prisma.institutionInstructor.count({ where: { institutionId: u.userId, status: 'accepted' } }),
      });
    }
    return {
      success: true,
      data: { ...base, interests: u.interests, expertise: u.expertise, educationLevel: u.educationLevel, socialMedia: u.socialMedia, memberSince: u.createdAt, ...extra },
    };
  }

  /** Pesquisa de pessoas: só aprovados, sem admins, sem o próprio e sem perfis privados (a não ser que já os siga). */
  async search(viewer: AuthUser, q: SearchUsersQueryDto) {
    const like = { contains: escapeLike(q.q), mode: 'insensitive' as const };
    const following = await this.prisma.userRelationship.findMany({ where: { userId: viewer.userId, ...FOLLOW }, select: { relatedUserId: true } });
    const where: Prisma.UserWhereInput = {
      status: UserStatus.approved, userId: { not: viewer.userId }, role: q.role ?? { not: UserRole.admin },
      OR: [{ isPrivate: false }, { userId: { in: following.map((f) => f.relatedUserId) } }],
      AND: [{ OR: [{ username: like }, { fullName: like }, { institutionName: like }] }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: [{ username: 'asc' }], skip: skipOf(q), take: q.limit, select: CARD }),
      this.prisma.user.count({ where }),
    ]);
    const set = new Set(following.map((f) => f.relatedUserId));
    return paginated(rows.map((r) => ({ ...card(r), viewerFollows: set.has(r.userId) })), total, q);
  }

  // ── Estatísticas públicas (página inicial) ───────────────────────────────

  /** Cache de 5 minutos em memória: é público e chamado a cada visita à página inicial. */
  async publicStats() {
    if (this.publicStatsCache && Date.now() - this.publicStatsCache.at < 300_000) return { success: true, data: this.publicStatsCache.data };
    const [students, instructors, institutions, courses, completed, certificates, events, communities] = await Promise.all([
      this.prisma.user.count({ where: { role: 'student', status: 'approved' } }),
      this.prisma.user.count({ where: { role: 'instructor', status: 'approved' } }),
      this.prisma.user.count({ where: { role: 'institution', status: 'approved' } }),
      this.prisma.course.count({ where: { status: 'published', isPublic: true } }),
      this.prisma.enrollment.count({ where: { status: 'completed' } }),
      this.prisma.certificate.count({ where: { status: 'issued' } }),
      this.prisma.event.count({ where: { status: { in: ['scheduled', 'live', 'completed'] } } }),
      this.prisma.community.count({ where: { isPublic: true, deletedAt: null, status: 'active' } }),
    ]);
    const data = { students, instructors, institutions, courses, completedCourses: completed, certificatesIssued: certificates, events, communities };
    this.publicStatsCache = { at: Date.now(), data };
    return { success: true, data };
  }
}
