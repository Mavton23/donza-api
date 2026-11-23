import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { GroupReportType, NotificationType } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudyGroupAchievementsService } from '../study-groups/study-group-achievements.service';
import { StudyGroupReportsService, weekPeriod } from '../study-groups/study-group-reports.service';

const HOUR = 3_600_000;
const BATCH = 5;
const TZ = 'Africa/Maputo';

interface Recipient { userId: string; email: string; username: string; notificationPreferences: unknown }
const RECIPIENT = { userId: true, email: true, username: true, notificationPreferences: true } as const;

/** `false` só se o utilizador desligou explicitamente essa categoria de email. */
const emailAllowed = (prefs: unknown, key: string) => (prefs as { email?: Record<string, boolean> } | null)?.email?.[key] !== false;

const fmtDateTime = (d: Date) => d.toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short', timeZone: TZ });
const fmtRemaining = (ms: number) => {
  const h = ms / HOUR;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} minutos`;
  const r = Math.round(h);
  return r === 1 ? '1 hora' : `${r} horas`;
};

/**
 * Tarefas periódicas. Seguras com várias instâncias da API: cada aviso é "reclamado" com um INSERT
 * em `reminder_dispatches` (chave única) e só quem o consegue inserir envia. Correr duas vezes seguidas
 * não repete avisos. `SCHEDULER_ENABLED=false` desliga os crons (os métodos continuam a poder ser chamados).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enabled: boolean;
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly reports: StudyGroupReportsService,
    private readonly achievements: StudyGroupAchievementsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('SCHEDULER_ENABLED') !== 'false';
  }

  /** Evita sobreposição de execuções do mesmo job na mesma instância e nunca deixa uma excepção escapar. */
  private async guarded(name: string, fn: () => Promise<unknown>) {
    if (!this.enabled || this.running.has(name)) return;
    this.running.add(name);
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Job "${name}" falhou`, err instanceof Error ? err.stack : String(err));
    } finally {
      this.running.delete(name);
    }
  }

  @Cron('*/10 * * * *') eventRemindersJob() { return this.guarded('event-reminders', () => this.sendEventReminders()); }
  @Cron('*/30 * * * *') taskRemindersJob() { return this.guarded('task-reminders', () => this.sendTaskReminders()); }
  @Cron('0 6 * * 1', { timeZone: TZ }) weeklyReportsJob() { return this.guarded('weekly-reports', () => this.runWeeklyReports()); }
  @Cron('0 4 * * *', { timeZone: TZ }) purgeJob() { return this.guarded('purge-dispatches', () => this.purgeDispatches()); }

  // ── Núcleo: reclamar avisos ──────────────────────────────────────────────

  /** Devolve só os utilizadores para quem este aviso ainda não tinha sido reclamado. */
  async claim(kind: string, entityId: string, userIds: string[], window: string): Promise<string[]> {
    if (!userIds.length) return [];
    const rows = await this.prisma.$queryRaw<{ userId: string }[]>`
      INSERT INTO reminder_dispatches ("kind", "entityId", "userId", "window")
      SELECT ${kind}, ${entityId}::uuid, u, ${window} FROM unnest(${userIds}::uuid[]) AS u
      ON CONFLICT DO NOTHING RETURNING "userId"`;
    return rows.map((r) => r.userId);
  }

  private async deliver(
    userIds: string[], type: NotificationType, payload: { title: string; message: string; relatedEntityId: string },
    prefKey: string, send: (u: Recipient) => Promise<unknown>,
  ) {
    if (!userIds.length) return 0;
    await this.notifications.notifyMany(userIds, type, payload); // in-app (respeita `inApp`)
    const users: Recipient[] = await this.prisma.user.findMany({ where: { userId: { in: userIds } }, select: RECIPIENT });
    const wanting = users.filter((u) => emailAllowed(u.notificationPreferences, prefKey));
    for (let i = 0; i < wanting.length; i += BATCH) await Promise.all(wanting.slice(i, i + BATCH).map(send));
    return userIds.length;
  }

  // ── Eventos ──────────────────────────────────────────────────────────────

  /** 24 h antes e 1 h antes. Um inscrito tardio (< 1 h) só recebe o da última hora. */
  async sendEventReminders(now = new Date()) {
    const events = await this.prisma.event.findMany({
      where: { status: 'scheduled', startDate: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
      select: { eventId: true, title: true, startDate: true },
    });
    let sent = 0;
    for (const ev of events) {
      const left = ev.startDate.getTime() - now.getTime();
      const window = left <= HOUR ? '1h' : '24h';
      const regs = await this.prisma.eventParticipant.findMany({ where: { eventId: ev.eventId, status: 'registered' }, select: { userId: true } });
      const ids = await this.claim('event', ev.eventId, regs.map((r) => r.userId), window);
      sent += await this.deliver(
        ids, NotificationType.EVENT_REMINDER,
        { title: `Lembrete: ${ev.title}`.slice(0, 100), message: `O evento "${ev.title}" começa em ${fmtRemaining(left)} (${fmtDateTime(ev.startDate)}).`, relatedEntityId: ev.eventId },
        'eventReminders',
        (u) => this.mail.sendTemplate('event-reminder', u.email, { username: u.username, eventName: ev.title, eventTime: fmtDateTime(ev.startDate), timeRemaining: fmtRemaining(left), eventUrl: `${this.mail.appUrl}/events/${ev.eventId}` }),
      );
    }
    return sent;
  }

  // ── Tarefas ──────────────────────────────────────────────────────────────

  /** Tarefas por concluir com prazo nas próximas 24 h, só a quem ainda não as concluiu. */
  async sendTaskReminders(now = new Date()) {
    const tasks = await this.prisma.groupTask.findMany({
      where: { status: { in: ['pending', 'in_progress'] }, deadline: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) }, group: { status: 'active' } },
      select: { taskId: true, groupId: true, title: true, deadline: true, assignments: { where: { status: 'pending' }, select: { userId: true } } },
    });
    let sent = 0;
    for (const t of tasks) {
      const left = t.deadline!.getTime() - now.getTime();
      const ids = await this.claim('task', t.taskId, t.assignments.map((a) => a.userId), '24h');
      sent += await this.deliver(
        ids, NotificationType.TASK_DEADLINE,
        { title: `Prazo a terminar: ${t.title}`.slice(0, 100), message: `A tarefa "${t.title}" termina em ${fmtRemaining(left)} (${fmtDateTime(t.deadline!)}).`, relatedEntityId: t.taskId },
        'taskDeadlines',
        (u) => this.mail.sendTemplate('task-reminder', u.email, { username: u.username, taskName: t.title, dueDate: fmtDateTime(t.deadline!), timeRemaining: fmtRemaining(left), taskUrl: `${this.mail.appUrl}/study-groups/${t.groupId}/tasks` }),
      );
    }
    return sent;
  }

  // ── Relatório semanal dos grupos ─────────────────────────────────────────

  /** Gera o relatório da semana anterior, avalia conquistas e avisa líderes/co-líderes (uma vez por semana). */
  async runWeeklyReports(now = new Date()) {
    const period = weekPeriod('previous', now);
    const weekKey = period.start.toISOString().slice(0, 10);
    let groups = 0, notified = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.studyGroup.findMany({
        where: { status: 'active' }, orderBy: { groupId: 'asc' }, take: 100, ...(cursor && { cursor: { groupId: cursor }, skip: 1 }), select: { groupId: true, name: true },
      });
      if (!page.length) break;
      cursor = page[page.length - 1].groupId;
      for (const g of page) {
        try {
          const leaders = await this.prisma.studyGroupMember.findMany({ where: { groupId: g.groupId, status: 'active', role: { in: ['leader', 'co_leader'] } }, select: { userId: true } });
          const claimed = await this.claim('group-weekly', g.groupId, leaders.map((l) => l.userId), weekKey);
          // se todos os líderes já foram avisados esta semana, outra instância tratou deste grupo
          if (leaders.length && !claimed.length) continue;
          const report = await this.reports.generate(g.groupId, GroupReportType.WEEKLY_ACTIVITY, period, null);
          await this.achievements.evaluateGroup(g.groupId);
          groups++;
          const d = report.data.data as { members: { active: number; total: number; engagementRate: number }; tasks: { completed: number }; discussions: { topics: number; replies: number } };
          await this.notifications.notifyMany(claimed, NotificationType.GROUP_REPORT_READY, {
            title: `Relatório semanal: ${g.name}`.slice(0, 100),
            message: `Semana de ${weekKey}: ${d.members.active}/${d.members.total} membros activos (${d.members.engagementRate}%), ${d.tasks.completed} tarefas concluídas, ${d.discussions.topics + d.discussions.replies} mensagens nas discussões.`,
            relatedEntityId: g.groupId, metadata: { reportId: report.data.reportId, weekStart: weekKey },
          });
          notified += claimed.length;
        } catch (err) {
          this.logger.error(`Relatório semanal falhou para o grupo ${g.groupId}`, err instanceof Error ? err.stack : String(err));
        }
      }
    }
    return { groups, notified };
  }

  /** Os registos só servem para não repetir avisos; guardam-se 90 dias. */
  async purgeDispatches(now = new Date()) {
    const { count } = await this.prisma.reminderDispatch.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 90 * 24 * HOUR) } } });
    return count;
  }
}
