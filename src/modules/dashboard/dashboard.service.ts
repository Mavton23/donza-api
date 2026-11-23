import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { countSeries, seriesWindow, SeriesPeriod } from '@/common/utils/time-series';
import { getManageableCourse } from '../courses/course-access';
import { PrismaService } from '../prisma/prisma.service';

const NOT_CANCELED = { not: 'canceled' } as const;
const PERSON = { userId: true, username: true, fullName: true, avatarUrl: true } as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  me(user: AuthUser) {
    switch (user.role) {
      case UserRole.student: return this.student(user.userId);
      case UserRole.instructor:
      case UserRole.institution: return this.instructor(user.userId);
      default: return Promise.resolve({ success: true, data: { role: user.role, redirect: '/admin/stats' } });
    }
  }

  async student(userId: string) {
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86_400_000);
    const [inProgress, completed, hours, events, assignments, certificates, unread] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: 'active' }, orderBy: [{ lastAccessed: { sort: 'desc', nulls: 'last' } }, { enrolledAt: 'desc' }], take: 10,
        select: { enrollmentId: true, progress: true, lastAccessed: true, course: { select: { courseId: true, title: true, slug: true, coverImageUrl: true } } },
      }),
      this.prisma.enrollment.count({ where: { userId, status: 'completed' } }),
      this.prisma.$queryRaw<{ h: number }[]>`
        SELECT COALESCE(SUM(c."duration"), 0)::int AS h FROM enrollments e JOIN courses c ON c."courseId" = e."courseId"
        WHERE e."userId" = ${userId}::uuid AND e."status" = 'completed'`,
      this.prisma.eventParticipant.findMany({
        where: { userId, status: 'registered', event: { startDate: { gte: now }, status: 'scheduled' } }, orderBy: { event: { startDate: 'asc' } }, take: 5,
        select: { event: { select: { eventId: true, title: true, startDate: true, isOnline: true } } },
      }),
      this.prisma.assignment.findMany({
        where: {
          status: 'published', dueDate: { gte: now, lte: in14 },
          course: { enrollments: { some: { userId, status: 'active' } } },
          submissions: { none: { userId, status: { in: ['submitted', 'graded', 'late'] } } },
        },
        orderBy: { dueDate: 'asc' }, take: 10, select: { assignmentId: true, title: true, dueDate: true, course: { select: { courseId: true, title: true } } },
      }),
      this.prisma.certificate.count({ where: { userId, status: 'issued' } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return {
      success: true,
      data: {
        role: 'student', inProgress, completedCourses: completed, learningHours: hours[0]?.h ?? 0,
        upcomingEvents: events.map((e) => e.event), assignmentsDue: assignments, certificates, unreadNotifications: unread,
      },
    };
  }

  /** Instrutor: cursos que lecciona. Instituição: cursos organizados ou dados por ela. */
  private scopeFor(userId: string, role: UserRole): Prisma.CourseWhereInput {
    return role === UserRole.institution ? { OR: [{ organizerId: userId }, { instructorId: userId }] } : { instructorId: userId };
  }

  async instructor(userId: string, role?: UserRole) {
    const r = role ?? (await this.prisma.user.findUniqueOrThrow({ where: { userId }, select: { role: true } })).role;
    const scope = this.scopeFor(userId, r);
    const inScope = { course: scope };
    const now = new Date();
    const [courses, students, enrollments, completed, toGrade, recent, events, rating, unread] = await Promise.all([
      this.prisma.course.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      this.prisma.user.count({ where: { enrollments: { some: { ...inScope, status: NOT_CANCELED } } } }),
      this.prisma.enrollment.count({ where: { ...inScope, status: NOT_CANCELED } }),
      this.prisma.enrollment.count({ where: { ...inScope, status: 'completed' } }),
      this.prisma.submission.count({ where: { status: { in: ['submitted', 'late'] }, assignment: { course: scope } } }),
      this.prisma.enrollment.findMany({
        where: { ...inScope, status: NOT_CANCELED }, orderBy: { enrolledAt: 'desc' }, take: 5,
        select: { enrollmentId: true, enrolledAt: true, user: { select: PERSON }, course: { select: { courseId: true, title: true } } },
      }),
      this.prisma.event.findMany({ where: { organizerId: userId, status: 'scheduled', startDate: { gte: now } }, orderBy: { startDate: 'asc' }, take: 5, select: { eventId: true, title: true, startDate: true } }),
      this.prisma.$queryRaw<{ avg: number | null; n: number }[]>`
        SELECT (SUM("ratingAverage" * "ratingCount") / NULLIF(SUM("ratingCount"), 0))::float AS avg, COALESCE(SUM("ratingCount"), 0)::int AS n
        FROM courses WHERE ${r === UserRole.institution ? Prisma.sql`("organizerId" = ${userId}::uuid OR "instructorId" = ${userId}::uuid)` : Prisma.sql`"instructorId" = ${userId}::uuid`} AND "ratingCount" > 0`,
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const byStatus = Object.fromEntries(courses.map((c) => [c.status, c._count._all]));
    return {
      success: true,
      data: {
        role: r, courses: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
        students, enrollments, completedEnrollments: completed, completionRate: enrollments ? Math.round((completed / enrollments) * 100) : 0,
        submissionsToGrade: toGrade, recentEnrollments: recent, upcomingEvents: events,
        rating: { average: Math.round((rating[0]?.avg ?? 0) * 10) / 10, count: rating[0]?.n ?? 0 }, unreadNotifications: unread,
      },
    };
  }

  /** Métricas de um instrutor: o próprio ou o admin. */
  async instructorMetrics(viewer: AuthUser, instructorId: string) {
    if (viewer.userId !== instructorId && viewer.role !== UserRole.admin) throw new ForbiddenException('Sem acesso às métricas deste instrutor');
    const u = await this.prisma.user.findUnique({ where: { userId: instructorId }, select: { role: true } });
    if (!u || (u.role !== UserRole.instructor && u.role !== UserRole.institution)) throw new NotFoundException({ message: 'Instrutor não encontrado', code: 'INSTRUCTOR_NOT_FOUND' });
    return this.instructor(instructorId, u.role);
  }

  async instructorAnalytics(user: AuthUser, period: SeriesPeriod) {
    const win = seriesWindow(period);
    const mine = user.role === UserRole.institution
      ? Prisma.sql`"courseId" IN (SELECT "courseId" FROM courses WHERE "organizerId" = ${user.userId}::uuid OR "instructorId" = ${user.userId}::uuid)`
      : Prisma.sql`"courseId" IN (SELECT "courseId" FROM courses WHERE "instructorId" = ${user.userId}::uuid)`;
    const [enrollments, completions] = await Promise.all([
      countSeries(this.prisma, win, { from: Prisma.sql`enrollments`, column: Prisma.sql`"enrolledAt"`, where: Prisma.sql`${mine} AND "status" <> 'canceled'` }),
      countSeries(this.prisma, win, { from: Prisma.sql`enrollments`, column: Prisma.sql`"completedAt"`, where: mine }),
    ]);
    return { success: true, data: { period, granularity: win.unit, labels: win.labels, series: { enrollments, completions } } };
  }

  async courseMetrics(user: AuthUser, courseId: string) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    const [byStatus, buckets, lessons, assignments, subs, reviews] = await Promise.all([
      this.prisma.enrollment.groupBy({ by: ['status'], where: { courseId }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ b: number; n: number }[]>`
        SELECT LEAST("progress" / 25, 3)::int AS b, COUNT(*)::int AS n FROM enrollments WHERE "courseId" = ${courseId}::uuid AND "status" <> 'canceled' GROUP BY 1`,
      this.prisma.$queryRaw<{ lessonId: string; title: string; ord: number; done: number }[]>`
        SELECT l."lessonId", l."title", (m."order" * 1000 + l."order")::int AS ord,
               COUNT(ul."userLessonId") FILTER (WHERE ul."completed" AND e."enrollmentId" IS NOT NULL)::int AS done
        FROM lessons l JOIN modules m ON m."moduleId" = l."moduleId"
        LEFT JOIN user_lessons ul ON ul."lessonId" = l."lessonId"
        LEFT JOIN enrollments e ON e."userId" = ul."userId" AND e."courseId" = m."courseId" AND e."status" <> 'canceled'
        WHERE m."courseId" = ${courseId}::uuid GROUP BY l."lessonId", l."title", m."order", l."order" ORDER BY ord`,
      this.prisma.assignment.count({ where: { courseId } }),
      this.prisma.submission.groupBy({ by: ['status'], where: { assignment: { courseId } }, _count: { _all: true } }),
      this.prisma.review.aggregate({ where: { entityType: 'course', courseId }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const total = Object.entries(status).filter(([k]) => k !== 'canceled').reduce((a, [, v]) => a + (v as number), 0);
    const bucketMap = new Map(buckets.map((b) => [b.b, b.n]));
    return {
      success: true,
      data: {
        course: { courseId: course.courseId, title: course.title },
        enrollments: { byStatus: status, total, completionRate: total ? Math.round((((status.completed as number) ?? 0) / total) * 100) : 0 },
        progressBuckets: { '0-24': bucketMap.get(0) ?? 0, '25-49': bucketMap.get(1) ?? 0, '50-74': bucketMap.get(2) ?? 0, '75-100': bucketMap.get(3) ?? 0 },
        lessons: lessons.map((l) => ({ lessonId: l.lessonId, title: l.title, completedBy: l.done, completionRate: total ? Math.round((l.done / total) * 100) : 0 })),
        assignments: { total: assignments, submissionsByStatus: Object.fromEntries(subs.map((s) => [s.status, s._count._all])) },
        reviews: { count: reviews._count._all, average: Math.round((reviews._avg.rating ?? 0) * 10) / 10 },
      },
    };
  }
}
