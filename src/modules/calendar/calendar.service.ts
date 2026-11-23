import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildIcs, IcsEvent } from './ics';

export interface CalendarEntry extends IcsEvent { kind: 'event' | 'assignment' | 'task' }
const DAY = 86_400_000;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: MailService) {}

  private get secret() { return this.config.get<string>('CALENDAR_SECRET') || this.config.getOrThrow<string>('JWT_REFRESH_SECRET'); }
  private mac(userId: string, version: number) { return createHmac('sha256', this.secret).update(`cal-feed:${userId}:${version}`).digest('base64url'); }

  // ── Itens do calendário ──────────────────────────────────────────────────

  /** Eventos (inscrito/organizador), prazos de trabalhos por entregar e tarefas de grupo atribuídas. */
  async entries(userId: string, from: Date, to: Date): Promise<CalendarEntry[]> {
    const [events, assignments, tasks] = await Promise.all([
      this.prisma.event.findMany({
        where: { status: { not: 'canceled' }, startDate: { gte: from, lte: to }, OR: [{ organizerId: userId }, { participants: { some: { userId, status: 'registered' } } }] },
        orderBy: { startDate: 'asc' }, take: 500,
      }),
      this.prisma.assignment.findMany({
        where: {
          status: 'published', dueDate: { gte: from, lte: to },
          course: { enrollments: { some: { userId, status: 'active' } } },
          submissions: { none: { userId, status: { in: ['submitted', 'graded', 'late'] } } },
        },
        orderBy: { dueDate: 'asc' }, take: 500, select: { assignmentId: true, title: true, dueDate: true, updatedAt: true, course: { select: { courseId: true, title: true, slug: true } } },
      }),
      this.prisma.groupTask.findMany({
        where: { deadline: { gte: from, lte: to }, status: { notIn: ['completed', 'archived'] }, assignments: { some: { userId, status: { not: 'completed' } } } },
        orderBy: { deadline: 'asc' }, take: 500, select: { taskId: true, title: true, description: true, deadline: true, updatedAt: true, group: { select: { groupId: true, name: true } } },
      }),
    ]);
    const app = this.mail.appUrl;
    const seq = (d: Date) => Math.floor(d.getTime() / 1000);
    return [
      ...events.map((e): CalendarEntry => ({
        kind: 'event', uid: `event-${e.eventId}@donza`, start: e.startDate, end: e.endDate ?? undefined, summary: e.title,
        description: [e.description, e.meetingUrl && `Ligação: ${e.meetingUrl}`].filter(Boolean).join('\n\n') || undefined,
        location: e.isOnline ? (e.meetingUrl ?? 'Online') : (e.location ?? undefined), url: `${app}/events/${e.eventId}`, sequence: seq(e.updatedAt), alarms: [60, 1440],
      })),
      ...assignments.map((a): CalendarEntry => ({
        kind: 'assignment', uid: `assignment-${a.assignmentId}@donza`, start: a.dueDate!, end: new Date(a.dueDate!.getTime() + 15 * 60_000),
        summary: `Prazo: ${a.title}`, description: `Curso: ${a.course.title}`, url: `${app}/courses/${a.course.slug}`, sequence: seq(a.updatedAt), alarms: [1440],
      })),
      ...tasks.map((t): CalendarEntry => ({
        kind: 'task', uid: `task-${t.taskId}@donza`, start: t.deadline!, end: new Date(t.deadline!.getTime() + 15 * 60_000),
        summary: `Tarefa: ${t.title}`, description: [`Grupo: ${t.group.name}`, t.description].filter(Boolean).join('\n\n'), url: `${app}/study-groups/${t.group.groupId}`, sequence: seq(t.updatedAt), alarms: [1440],
      })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private window(from?: string, to?: string) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * DAY);
    const t = to ? new Date(to) : new Date(Date.now() + 365 * DAY);
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || t < f) throw new BadRequestException({ message: 'Intervalo inválido', code: 'INVALID_RANGE' });
    if (t.getTime() - f.getTime() > 800 * DAY) throw new BadRequestException({ message: 'Intervalo máximo: 800 dias', code: 'RANGE_TOO_LARGE' });
    return { f, t };
  }

  async list(user: AuthUser, from?: string, to?: string) {
    const { f, t } = this.window(from, to);
    const data = await this.entries(user.userId, f, t);
    return { success: true, data: data.map(({ alarms, sequence, ...e }) => e) };
  }

  async exportIcs(user: AuthUser, from?: string, to?: string) {
    const { f, t } = this.window(from, to);
    return buildIcs(await this.entries(user.userId, f, t), { name: 'Donza' });
  }

  /** Um evento isolado (para o botão "adicionar ao calendário"). Só eventos que podem ser vistos publicamente. */
  async eventIcs(eventId: string) {
    const e = await this.prisma.event.findUnique({ where: { eventId } });
    if (!e || e.status === 'canceled') throw new NotFoundException({ message: 'Evento não encontrado', code: 'EVENT_NOT_FOUND' });
    return buildIcs([{
      uid: `event-${e.eventId}@donza`, start: e.startDate, end: e.endDate ?? undefined, summary: e.title, description: e.description ?? undefined,
      location: e.isOnline ? (e.meetingUrl ?? 'Online') : (e.location ?? undefined), url: `${this.mail.appUrl}/events/${e.eventId}`, sequence: Math.floor(e.updatedAt.getTime() / 1000), alarms: [60],
    }], { name: e.title });
  }

  // ── Subscrição por link ──────────────────────────────────────────────────

  private async feedUrl(userId: string, version: number) {
    const base = (this.config.get<string>('API_PUBLIC_URL') || `http://localhost:${this.config.get('PORT') ?? 3001}`).replace(/\/$/, '');
    return `${base}/api/calendar/feed/${userId}.${version}.${this.mac(userId, version)}`;
  }

  async feedToken(user: AuthUser, rotate = false) {
    const u = rotate
      ? await this.prisma.user.update({ where: { userId: user.userId }, data: { calendarTokenVersion: { increment: 1 } }, select: { calendarTokenVersion: true } })
      : await this.prisma.user.findUniqueOrThrow({ where: { userId: user.userId }, select: { calendarTokenVersion: true } });
    return { success: true, data: { url: await this.feedUrl(user.userId, u.calendarTokenVersion) } };
  }

  /** O link é segredo: quem o tem vê o calendário. Roda-se com `rotate` para invalidar o anterior. */
  async feed(token: string) {
    const [userId, ver, mac] = token.split('.');
    const version = Number(ver);
    if (!userId || !mac || !Number.isInteger(version)) throw new NotFoundException();
    const given = Buffer.from(mac), expected = Buffer.from(this.mac(userId, version));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotFoundException();
    const u = await this.prisma.user.findUnique({ where: { userId }, select: { calendarTokenVersion: true, status: true } }).catch(() => null);
    if (!u || u.calendarTokenVersion !== version || u.status !== 'approved') throw new NotFoundException();
    const { f, t } = this.window();
    return buildIcs(await this.entries(userId, f, t), { name: 'Donza' });
  }
}
