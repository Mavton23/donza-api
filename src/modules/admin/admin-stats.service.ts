import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, ContactRequestStatus, EnrollmentStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { paginated, skipOf } from '@/common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ChartQueryDto, ListActivitiesQueryDto, ListAuditQueryDto } from './dto/admin.dto';

const DAY = 86_400_000;
const USER_MIN = { userId: true, username: true, fullName: true, avatarUrl: true, role: true } as const;

/** Tabelas e colunas permitidas nas séries (lista fixa: nunca vem do pedido). */
const SERIES = {
  users: Prisma.raw('"users"'),
  courses: Prisma.raw('"courses"'),
  enrollments: Prisma.raw('"enrollments"'),
  events: Prisma.raw('"events"'),
} as const;

const group = <K extends string>(rows: { _count: { _all: number } }[] & unknown[], key: K) =>
  Object.fromEntries((rows as any[]).map((r) => [String(r[key]), r._count._all as number]));

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const since = new Date(Date.now() - 30 * DAY);
    const p = this.prisma;
    const [byRole, byStatus, newUsers, courses, enrollments, certificates, events, communities, groups, pendingUsers, pendingDocs, openContacts, pendingTestimonials, reviews] = await Promise.all([
      p.user.groupBy({ by: ['role'], _count: { _all: true } }),
      p.user.groupBy({ by: ['status'], _count: { _all: true } }),
      p.user.count({ where: { createdAt: { gte: since } } }),
      p.course.groupBy({ by: ['status'], _count: { _all: true } }),
      p.enrollment.groupBy({ by: ['status'], _count: { _all: true } }),
      p.certificate.count({ where: { status: 'issued' } }),
      p.event.groupBy({ by: ['status'], _count: { _all: true } }),
      p.community.count({ where: { deletedAt: null } }),
      p.studyGroup.count({ where: { status: 'active' } }),
      p.user.count({ where: { status: UserStatus.pending, role: { in: [UserRole.instructor, UserRole.institution] } } }),
      p.userDocument.count({ where: { status: ApprovalStatus.pending, userId: { not: null } } }),
      p.contactRequest.count({ where: { status: ContactRequestStatus.pending } }),
      p.testimonial.count({ where: { status: ApprovalStatus.pending } }),
      p.review.count(),
    ]);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    const u = group(byRole, 'role'), us = group(byStatus, 'status'), c = group(courses, 'status'), e = group(enrollments, 'status'), ev = group(events, 'status');
    return {
      success: true,
      data: {
        users: { total: sum(u), byRole: u, byStatus: us, newLast30Days: newUsers },
        courses: { total: sum(c), byStatus: c },
        enrollments: { total: sum(e), active: e[EnrollmentStatus.active] ?? 0, completed: e[EnrollmentStatus.completed] ?? 0, canceled: e[EnrollmentStatus.canceled] ?? 0 },
        events: { total: sum(ev), byStatus: ev },
        communities, studyGroups: groups, certificatesIssued: certificates, reviews,
        pending: { verifications: pendingUsers, documents: pendingDocs, contactRequests: openContacts, testimonials: pendingTestimonials },
      },
    };
  }

  async pendingVerifications() {
    const [users, documents] = await Promise.all([
      this.prisma.user.count({ where: { status: UserStatus.pending, role: { in: [UserRole.instructor, UserRole.institution] } } }),
      this.prisma.userDocument.count({ where: { status: ApprovalStatus.pending, userId: { not: null } } }),
    ]);
    return { success: true, data: { users, documents, total: users + documents } };
  }

  /** Séries com todos os dias (ou meses, em `12m`) preenchidos, mesmo com zero registos. */
  async chart(q: ChartQueryDto) {
    const monthly = q.period === '12m';
    const now = new Date();
    const start = monthly
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (parseInt(q.period, 10) - 1) * DAY);
    const unit = monthly ? 'month' : 'day';
    const labels: string[] = [];
    for (let d = new Date(start); d <= now; d = monthly ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + DAY)) {
      labels.push(d.toISOString().slice(0, monthly ? 7 : 10));
    }
    const entries = await Promise.all(
      (Object.keys(SERIES) as (keyof typeof SERIES)[]).map(async (name) => {
        const rows = await this.prisma.$queryRaw<{ d: string; n: number }[]>`
          SELECT to_char(date_trunc(${unit}, "createdAt"), ${monthly ? 'YYYY-MM' : 'YYYY-MM-DD'}) AS d, COUNT(*)::int AS n
          FROM ${SERIES[name]} WHERE "createdAt" >= ${start} GROUP BY 1`;
        const m = new Map(rows.map((r) => [r.d, r.n]));
        return [name, labels.map((l) => m.get(l) ?? 0)] as const;
      }),
    );
    return { success: true, data: { period: q.period, granularity: unit, labels, series: Object.fromEntries(entries) } };
  }

  // ── Registo de actividade e auditoria ────────────────────────────────────

  async activities(q: ListActivitiesQueryDto) {
    const where: Prisma.ActivityWhereInput = {
      ...(q.type && { type: q.type }), ...(q.userId && { userId: q.userId }), ...(q.groupId && { groupId: q.groupId }), ...(q.courseId && { courseId: q.courseId }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, include: { user: { select: USER_MIN } } }),
      this.prisma.activity.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async activity(activityId: string) {
    const a = await this.prisma.activity.findUnique({
      where: { activityId }, include: { user: { select: USER_MIN }, group: { select: { groupId: true, name: true } }, course: { select: { courseId: true, title: true } } },
    });
    if (!a) throw new NotFoundException({ message: 'Actividade não encontrada', code: 'ACTIVITY_NOT_FOUND' });
    return { success: true, data: a };
  }

  async auditLogs(q: ListAuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId && { userId: q.userId }), ...(q.action && { action: { contains: q.action.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, include: { user: { select: USER_MIN } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(rows, total, q);
  }
}
