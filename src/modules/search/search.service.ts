import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { displayName } from '../courses/course-access';
import { DirectMessagesService } from '../messages/direct-messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalSearchQueryDto, MessageableQueryDto, QueryOnlyDto, SearchInstructorsQueryDto } from './dto/search.dto';

const PERSON = { userId: true, username: true, fullName: true, institutionName: true, avatarUrl: true, role: true } as const;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly direct: DirectMessagesService) {}

  private like(q: string) { return { contains: escapeLike(q), mode: 'insensitive' as const }; }

  /** Quem pode aparecer em pesquisas: aprovado, não admin, e perfis privados só para quem os segue. */
  private visiblePeople(viewer: AuthUser | undefined): Prisma.UserWhereInput {
    return {
      status: UserStatus.approved, role: { not: UserRole.admin },
      ...(viewer && { userId: { not: viewer.userId } }),
      OR: [{ isPrivate: false }, ...(viewer ? [{ relationshipsReceived: { some: { userId: viewer.userId, relationshipType: 'follow' as const, status: 'accepted' as const } } }] : [])],
    };
  }

  async global(viewer: AuthUser | undefined, q: GlobalSearchQueryDto) {
    const l = this.like(q.q);
    const want = (t: string) => q.type === 'all' || q.type === t;
    const [courses, events, communities, people] = await Promise.all([
      want('courses') ? this.prisma.course.findMany({
        where: { status: 'published', isPublic: true, OR: [{ title: l }, { shortDescription: l }, { category: l }] }, take: q.limit,
        orderBy: [{ ratingAverage: 'desc' }, { createdAt: 'desc' }],
        select: { courseId: true, title: true, slug: true, coverImageUrl: true, category: true, level: true, price: true, ratingAverage: true, ratingCount: true },
      }) : [],
      want('events') ? this.prisma.event.findMany({
        where: { status: { in: ['scheduled', 'live'] }, OR: [{ title: l }, { description: l }] }, take: q.limit, orderBy: { startDate: 'asc' },
        select: { eventId: true, title: true, startDate: true, isOnline: true, location: true, price: true },
      }) : [],
      want('communities') ? this.prisma.community.findMany({
        where: { isPublic: true, status: 'active', deletedAt: null, OR: [{ name: l }, { shortDescription: l }, { tags: { has: q.q.toLowerCase() } }] }, take: q.limit, orderBy: { createdAt: 'desc' },
        select: { communityId: true, name: true, slug: true, shortDescription: true, thumbnailImage: true, tags: true },
      }) : [],
      want('people') ? this.prisma.user.findMany({
        where: { AND: [this.visiblePeople(viewer), { role: { in: [UserRole.instructor, UserRole.institution] } }, { OR: [{ username: l }, { fullName: l }, { institutionName: l }] }] },
        take: q.limit, orderBy: { username: 'asc' }, select: PERSON,
      }) : [],
    ]);
    return {
      success: true,
      data: {
        query: q.q,
        courses: courses.map((c) => ({ ...c, price: Number(c.price), ratingAverage: Number(c.ratingAverage) })),
        events: events.map((e) => ({ ...e, price: Number(e.price) })),
        communities,
        people: people.map((p) => ({ ...p, name: displayName(p) })),
      },
    };
  }

  async instructors(viewer: AuthUser | undefined, q: SearchInstructorsQueryDto) {
    const l = q.q ? this.like(q.q) : undefined;
    const where: Prisma.UserWhereInput = {
      AND: [
        this.visiblePeople(viewer), { role: UserRole.instructor },
        ...(l ? [{ OR: [{ username: l }, { fullName: l }, { bio: l }] }] : []),
        ...(q.expertise ? [{ expertise: { has: q.expertise } }] : []),
        ...(q.institutionId ? [{ institutions: { some: { institutionId: q.institutionId, status: 'accepted' as const } } }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { username: 'asc' }, skip: skipOf(q), take: q.limit, select: { ...PERSON, bio: true, expertise: true, teachingExperience: true } }),
      this.prisma.user.count({ where }),
    ]);
    const ids = rows.map((r) => r.userId);
    const stats = ids.length ? await this.prisma.$queryRaw<{ id: string; courses: number; students: number; avg: number | null }[]>`
      SELECT c."instructorId" AS id, COUNT(DISTINCT c."courseId")::int AS courses,
             (SELECT COUNT(DISTINCT e."userId") FROM enrollments e JOIN courses c2 ON c2."courseId" = e."courseId"
               WHERE c2."instructorId" = c."instructorId" AND c2."status" = 'published' AND e."status" <> 'canceled')::int AS students,
             (SUM(c."ratingAverage" * c."ratingCount") / NULLIF(SUM(c."ratingCount"), 0))::float AS avg
      FROM courses c WHERE c."instructorId" = ANY(${ids}::uuid[]) AND c."status" = 'published' GROUP BY c."instructorId"` : [];
    const s = new Map(stats.map((x) => [x.id, x]));
    return paginated(rows.map((r) => ({
      ...r, name: displayName(r), coursesCount: s.get(r.userId)?.courses ?? 0, studentsCount: s.get(r.userId)?.students ?? 0,
      rating: Math.round((s.get(r.userId)?.avg ?? 0) * 10) / 10,
    })), total, q);
  }

  /** Utilizadores a quem o visualizador pode escrever, com a indicação de poder iniciar já a conversa. */
  async messageable(viewer: AuthUser, q: MessageableQueryDto) {
    const l = this.like(q.q);
    const users = await this.prisma.user.findMany({
      where: { status: UserStatus.approved, userId: { not: viewer.userId }, OR: [{ username: l }, { fullName: l }, { institutionName: l }], ...(viewer.role !== UserRole.admin && { role: { not: UserRole.admin } }) },
      take: q.limit, orderBy: { username: 'asc' }, select: { ...PERSON, messagePreferences: true },
    });
    const data = await Promise.all(users.map(async ({ messagePreferences, ...u }) => ({ ...u, name: displayName(u), canMessageDirectly: await this.direct.mayStartDirectly(viewer, { userId: u.userId, messagePreferences }) })));
    return { success: true, data };
  }

  async enrolledCourses(viewer: AuthUser, q: QueryOnlyDto) {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId: viewer.userId, status: { not: 'canceled' }, ...(q.q && { course: { title: this.like(q.q) } }) }, take: q.limit, orderBy: { enrolledAt: 'desc' },
      select: { enrollmentId: true, progress: true, status: true, course: { select: { courseId: true, title: true, slug: true, coverImageUrl: true } } },
    });
    return { success: true, data: rows };
  }
}
