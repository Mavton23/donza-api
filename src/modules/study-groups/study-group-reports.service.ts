import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupReportType, Prisma, StudyGroupMemberStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ListReportsQueryDto } from './dto/group-reports.dto';
import { groupContext } from './study-group-access';

const LIVE: StudyGroupMemberStatus[] = ['active', 'muted'];
const DAY = 86_400_000;
const USER_MIN = { userId: true, username: true, fullName: true, avatarUrl: true } as const;
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

/** Segunda-feira 00:00 UTC da semana de `d`. */
export function startOfWeek(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY);
}
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Períodos: semana (Seg–Dom UTC), mês civil, ou N dias terminados hoje. */
export function weekPeriod(which: 'current' | 'previous', now = new Date()) {
  const cur = startOfWeek(now);
  return which === 'current' ? { start: cur, end: now } : { start: new Date(cur.getTime() - 7 * DAY), end: cur };
}
export function monthPeriod(which: 'current' | 'previous', now = new Date()) {
  const cur = startOfMonth(now);
  return which === 'current' ? { start: cur, end: now } : { start: new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 1, 1)), end: cur };
}

@Injectable()
export class StudyGroupReportsService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  private async managerCtx(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.isMember) throw new ForbiddenException('Acesso restrito a membros do grupo');
    if (!ctx.canManage) throw new ForbiddenException('Apenas o líder ou co-líder acedem aos relatórios');
    return ctx;
  }

  // ── Pedidos HTTP ─────────────────────────────────────────────────────────

  async weekly(user: AuthUser, groupId: string, which: 'current' | 'previous') {
    await this.managerCtx(user, groupId);
    return this.generate(groupId, GroupReportType.WEEKLY_ACTIVITY, weekPeriod(which), user.userId);
  }

  async monthly(user: AuthUser, groupId: string, which: 'current' | 'previous') {
    await this.managerCtx(user, groupId);
    return this.generate(groupId, GroupReportType.MONTHLY_SUMMARY, monthPeriod(which), user.userId);
  }

  async tasks(user: AuthUser, groupId: string, period: keyof typeof PERIOD_DAYS = '30d') {
    await this.managerCtx(user, groupId);
    const now = new Date();
    return this.generate(groupId, GroupReportType.TASK_COMPLETION, { start: new Date(startOfDay(now).getTime() - PERIOD_DAYS[period] * DAY), end: now }, user.userId);
  }

  async history(user: AuthUser, groupId: string, q: ListReportsQueryDto) {
    await this.managerCtx(user, groupId);
    const where: Prisma.GroupReportWhereInput = { groupId, ...(q.type && { type: q.type }) };
    const [rows, total] = await Promise.all([
      this.prisma.groupReport.findMany({ where, orderBy: { periodStart: 'desc' }, skip: skipOf(q), take: q.limit, select: { reportId: true, type: true, periodStart: true, periodEnd: true, createdAt: true, updatedAt: true, generatedById: true } }),
      this.prisma.groupReport.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async get(user: AuthUser, groupId: string, reportId: string) {
    await this.managerCtx(user, groupId);
    const r = await this.prisma.groupReport.findFirst({ where: { reportId, groupId } });
    if (!r) throw new NotFoundException({ message: 'Relatório não encontrado', code: 'REPORT_NOT_FOUND' });
    return { success: true, data: r };
  }

  // ── Geração (também usada pelo agendador) ────────────────────────────────

  /** Calcula e grava (upsert por grupo+tipo+início do período: gerar de novo actualiza, não duplica). */
  async generate(groupId: string, type: GroupReportType, period: { start: Date; end: Date }, generatedById: string | null) {
    if (period.end <= period.start) throw new BadRequestException('Período inválido');
    const data = (type === GroupReportType.TASK_COMPLETION ? await this.taskData(groupId, period) : await this.activityData(groupId, period)) as Prisma.InputJsonObject;
    const row = await this.prisma.groupReport.upsert({
      where: { groupId_type_periodStart: { groupId, type, periodStart: period.start } },
      create: { groupId, type, data, periodStart: period.start, periodEnd: period.end, generatedById },
      update: { data, periodEnd: period.end, generatedById },
    });
    return { success: true, data: row };
  }

  private async activityData(groupId: string, { start, end }: { start: Date; end: Date }) {
    const inRange = { gte: start, lt: end };
    const live = { groupId, status: { in: LIVE } };
    const [members, joined, left, topics, replies, contents, tasksCreated, tasksDone, meetings, meetingsDone, byUser, daily] = await Promise.all([
      this.prisma.studyGroupMember.count({ where: live }),
      this.prisma.studyGroupMember.count({ where: { groupId, joinedAt: inRange } }),
      this.prisma.studyGroupMember.count({ where: { groupId, leftAt: inRange } }),
      this.prisma.discussionTopic.count({ where: { groupId, createdAt: inRange } }),
      this.prisma.discussionReply.count({ where: { topic: { groupId }, createdAt: inRange } }),
      this.prisma.sharedContent.count({ where: { groupId, createdAt: inRange } }),
      this.prisma.groupTask.count({ where: { groupId, createdAt: inRange } }),
      this.prisma.taskAssignment.count({ where: { task: { groupId }, status: 'completed', updatedAt: inRange } }),
      this.prisma.groupMeeting.count({ where: { groupId, startTime: inRange, status: { not: 'canceled' } } }),
      this.prisma.groupMeeting.count({ where: { groupId, startTime: inRange, status: 'completed' } }),
      this.prisma.activity.groupBy({ by: ['userId'], where: { groupId, createdAt: inRange }, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } } }),
      this.activity.dailyGroupActivity(groupId, start),
    ]);
    // só membros actuais contam como "activos" / contribuidores
    const liveIds = new Set((await this.prisma.studyGroupMember.findMany({ where: live, select: { userId: true } })).map((m) => m.userId));
    const active = byUser.filter((u) => liveIds.has(u.userId));
    const top = active.slice(0, 5);
    const users = top.length ? await this.prisma.user.findMany({ where: { userId: { in: top.map((t) => t.userId) } }, select: USER_MIN }) : [];
    const byId = new Map(users.map((u) => [u.userId, u]));
    const activeSet = new Set(active.map((a) => a.userId));
    const inactive = await this.prisma.studyGroupMember.findMany({
      where: { ...live, joinedAt: { lt: start }, userId: { notIn: [...activeSet] } }, take: 10, orderBy: { lastActiveAt: { sort: 'asc', nulls: 'first' } },
      select: { lastActiveAt: true, user: { select: USER_MIN } },
    });
    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      members: { total: members, joined, left, active: active.length, engagementRate: members ? Math.round((active.length / members) * 100) : 0 },
      discussions: { topics, replies },
      contents: { shared: contents },
      tasks: { created: tasksCreated, completed: tasksDone },
      meetings: { held: meetings, completed: meetingsDone },
      totalActions: active.reduce((n, a) => n + a._count._all, 0),
      topContributors: top.map((t) => ({ ...byId.get(t.userId), actions: t._count._all })),
      inactiveMembers: inactive.map((m) => ({ ...m.user, lastActiveAt: m.lastActiveAt })),
      dailyActivity: daily.filter((d) => d.date < end).map((d) => ({ date: d.date, activeUsers: d.activeUsers, actions: d.actions })),
    };
  }

  private async taskData(groupId: string, { start, end }: { start: Date; end: Date }) {
    const tasks = await this.prisma.groupTask.findMany({
      where: { groupId, status: { not: 'archived' } },
      select: { taskId: true, title: true, status: true, priority: true, deadline: true, createdAt: true, assignments: { select: { userId: true, status: true, updatedAt: true } } },
    });
    const now = end;
    const open = tasks.filter((t) => t.status !== 'completed');
    const overdue = open.filter((t) => t.deadline && t.deadline < now);
    const completedInPeriod = tasks.filter((t) => t.assignments.some((a) => a.status === 'completed' && a.updatedAt >= start && a.updatedAt < end)).length;
    const perUser = new Map<string, { assigned: number; completed: number; overdue: number }>();
    for (const t of tasks) {
      for (const a of t.assignments) {
        const e = perUser.get(a.userId) ?? { assigned: 0, completed: 0, overdue: 0 };
        e.assigned++;
        if (a.status === 'completed') e.completed++;
        else if (t.deadline && t.deadline < now && t.status !== 'completed') e.overdue++;
        perUser.set(a.userId, e);
      }
    }
    const users = perUser.size ? await this.prisma.user.findMany({ where: { userId: { in: [...perUser.keys()] } }, select: USER_MIN }) : [];
    const byId = new Map(users.map((u) => [u.userId, u]));
    const count = <K extends string>(key: (t: (typeof tasks)[number]) => K) => tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [key(t)]: (acc[key(t)] ?? 0) + 1 }), {});
    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      totals: { tasks: tasks.length, completed: tasks.length - open.length, open: open.length, overdue: overdue.length, completedInPeriod, completionRate: tasks.length ? Math.round(((tasks.length - open.length) / tasks.length) * 100) : 0 },
      byStatus: count((t) => t.status),
      byPriority: count((t) => t.priority),
      overdueTasks: overdue.sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime()).slice(0, 10).map((t) => ({ taskId: t.taskId, title: t.title, deadline: t.deadline, priority: t.priority })),
      upcomingDeadlines: open.filter((t) => t.deadline && t.deadline >= now && t.deadline < new Date(now.getTime() + 7 * DAY)).sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime()).slice(0, 10).map((t) => ({ taskId: t.taskId, title: t.title, deadline: t.deadline, priority: t.priority })),
      members: [...perUser.entries()].map(([userId, v]) => ({ ...byId.get(userId), ...v, completionRate: v.assigned ? Math.round((v.completed / v.assigned) * 100) : 0 })).sort((a, b) => b.completed - a.completed),
    };
  }
}
