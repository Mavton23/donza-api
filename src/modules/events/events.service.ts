import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityEntityType,
  ActivityType,
  EventParticipantStatus,
  EventStatus,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, ListEventsQueryDto, MyEventsQueryDto, UpdateEventDto } from './dto/event.dto';

/** Inscrições que ocupam lugar. */
const ACTIVE_REG: Prisma.EventParticipantWhereInput = {
  status: { in: [EventParticipantStatus.registered, EventParticipantStatus.attended] },
};

const ORGANIZER_SELECT = {
  userId: true,
  username: true,
  avatarUrl: true,
  role: true,
  fullName: true,
  institutionName: true,
} as const;

/** Transições de estado permitidas (estados finais não voltam atrás). */
const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  scheduled: ['live', 'completed', 'canceled'],
  live: ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

/** Campos cuja alteração justifica avisar os inscritos. */
const SIGNIFICANT = ['startDate', 'endDate', 'location', 'isOnline', 'meetingUrl', 'status'] as const;

type EventRow = Prisma.EventGetPayload<{ include: { organizer: { select: typeof ORGANIZER_SELECT } } }>;

const canManage = (user: AuthUser | undefined, e: { organizerId: string }) =>
  !!user && (user.role === UserRole.admin || e.organizerId === user.userId);

const organizerName = (o: { role: UserRole; institutionName: string | null; fullName: string | null; username: string }) =>
  o.role === UserRole.institution ? (o.institutionName ?? o.username) : (o.fullName ?? o.username);

const dayRange = (d: Date) => {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Leitura ────────────────────────────────────────────────────────────────

  /** `meetingUrl` e emails nunca saem em listagens; o link só vai a inscritos/gestores no detalhe. */
  private shape(e: EventRow, count: number, extra: Record<string, unknown> = {}) {
    const { meetingUrl: _m, organizer, ...rest } = e;
    return {
      ...rest,
      organizer: { ...organizer, name: organizerName(organizer) },
      participantsCount: count,
      spotsLeft: e.maxParticipants == null ? null : Math.max(0, e.maxParticipants - count),
      ...extra,
    };
  }

  private async counts(eventIds: string[]) {
    if (!eventIds.length) return new Map<string, number>();
    const rows = await this.prisma.eventParticipant.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, ...ACTIVE_REG },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.eventId, r._count._all]));
  }

  private async page(where: Prisma.EventWhereInput, q: { page: number; limit: number }, orderBy: Prisma.EventOrderByWithRelationInput) {
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy,
        skip: skipOf(q),
        take: q.limit,
        include: { organizer: { select: ORGANIZER_SELECT } },
      }),
      this.prisma.event.count({ where }),
    ]);
    const counts = await this.counts(rows.map((r) => r.eventId));
    return paginated(rows.map((r) => this.shape(r, counts.get(r.eventId) ?? 0)), total, q);
  }

  private filters(q: ListEventsQueryDto): Prisma.EventWhereInput {
    return {
      ...(q.type && { isOnline: q.type === 'online' }),
      ...(q.date && { startDate: dayRange(q.date) }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  /** Público: por omissão só agendados (como no Express). */
  listPublic(q: ListEventsQueryDto) {
    return this.page({ status: q.status ?? EventStatus.scheduled, ...this.filters(q) }, q, {
      startDate: q.sort === 'recent' ? 'desc' : 'asc',
    });
  }

  listAdmin(q: ListEventsQueryDto) {
    return this.page({ ...(q.status && { status: q.status }), ...this.filters(q) }, q, {
      startDate: q.sort === 'recent' ? 'desc' : 'asc',
    });
  }

  /** Eventos em que o utilizador está inscrito. */
  async myRegistrations(userId: string, q: MyEventsQueryDto) {
    const now = new Date();
    const event: Prisma.EventWhereInput =
      q.when === 'past' ? { startDate: { lt: now } } : q.when === 'upcoming' ? { startDate: { gte: now } } : {};
    const where: Prisma.EventParticipantWhereInput = { userId, ...ACTIVE_REG, event };
    const [rows, total] = await Promise.all([
      this.prisma.eventParticipant.findMany({
        where,
        orderBy: { event: { startDate: q.when === 'past' ? 'desc' : 'asc' } },
        skip: skipOf(q),
        take: q.limit,
        include: { event: { include: { organizer: { select: ORGANIZER_SELECT } } } },
      }),
      this.prisma.eventParticipant.count({ where }),
    ]);
    const counts = await this.counts(rows.map((r) => r.eventId));
    return paginated(
      rows.map((r) =>
        this.shape(r.event, counts.get(r.eventId) ?? 0, {
          registration: { status: r.status, attended: r.attended, registeredAt: r.registeredAt },
          // inscrito: pode ver o link
          meetingUrl: r.event.meetingUrl,
        }),
      ),
      total,
      q,
    );
  }

  /** Eventos que o utilizador organiza. */
  organized(userId: string, q: ListEventsQueryDto) {
    return this.page({ organizerId: userId, ...(q.status && { status: q.status }), ...this.filters(q) }, q, {
      startDate: q.sort === 'upcoming' ? 'asc' : 'desc',
    });
  }

  async getDetail(eventId: string, viewer?: AuthUser) {
    const event = await this.prisma.event.findUnique({
      where: { eventId },
      include: { organizer: { select: { ...ORGANIZER_SELECT, bio: true } } },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const [count, reg] = await Promise.all([
      this.prisma.eventParticipant.count({ where: { eventId, ...ACTIVE_REG } }),
      viewer
        ? this.prisma.eventParticipant.findUnique({
            where: { userId_eventId: { userId: viewer.userId, eventId } },
            select: { status: true, attended: true, registeredAt: true },
          })
        : null,
    ]);
    const registered = !!reg && reg.status !== EventParticipantStatus.cancelled;
    const manage = canManage(viewer, event);

    return {
      success: true,
      data: this.shape(event, count, {
        // Só inscritos e gestores veem o link da reunião (antes estava público).
        ...(registered || manage ? { meetingUrl: event.meetingUrl } : { meetingUrl: null, meetingUrlLocked: !!event.meetingUrl }),
        viewer: { isRegistered: registered, registration: registered ? reg : null, canManage: manage },
      }),
    };
  }

  // ── Escrita ────────────────────────────────────────────────────────────────

  private assertDates(start: Date, end: Date | null | undefined) {
    if (end && end <= start) throw new BadRequestException('A data de fim deve ser posterior à data de início');
  }

  async create(user: AuthUser, dto: CreateEventDto) {
    if (dto.startDate <= new Date()) throw new BadRequestException('A data de início deve estar no futuro');
    this.assertDates(dto.startDate, dto.endDate);

    let organizerId = user.userId;
    if (user.role === UserRole.institution) {
      const me = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { institutionName: true } });
      if (!me?.institutionName) throw new ForbiddenException('Seu perfil de instituição precisa ser completado');
    }
    if (dto.organizerId && dto.organizerId !== user.userId) {
      if (user.role !== UserRole.admin) throw new ForbiddenException('Apenas administradores podem definir outro organizador');
      const org = await this.prisma.user.findUnique({ where: { userId: dto.organizerId }, select: { role: true, status: true } });
      if (!org || org.role === UserRole.student) {
        throw new BadRequestException('O organizador deve ser um instrutor, instituição ou administrador');
      }
      organizerId = dto.organizerId;
    }

    const { organizerId: _o, ...data } = dto;
    const event = await this.prisma.event.create({ data: { ...data, organizerId, status: EventStatus.scheduled } });

    await this.notifications.notifyMany([organizerId], NotificationType.EVENT_CREATED, {
      title: 'Evento criado',
      message: `O evento "${event.title}" foi criado com sucesso.`,
      relatedEntityId: event.eventId,
    });
    return { success: true, data: event };
  }

  private async getManageable(eventId: string, user: AuthUser) {
    const event = await this.prisma.event.findUnique({ where: { eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (!canManage(user, event)) throw new ForbiddenException('Você não tem permissão para gerir este evento');
    return event;
  }

  async update(user: AuthUser, eventId: string, dto: UpdateEventDto) {
    const event = await this.getManageable(eventId, user);

    if (dto.status && dto.status !== event.status && !TRANSITIONS[event.status].includes(dto.status)) {
      throw new BadRequestException(`Não é possível mudar o estado de "${event.status}" para "${dto.status}"`);
    }
    if (event.status === EventStatus.completed || event.status === EventStatus.canceled) {
      throw new ConflictException('Eventos concluídos ou cancelados não podem ser editados');
    }

    const start = dto.startDate ?? event.startDate;
    const end = dto.endDate === undefined ? event.endDate : dto.endDate;
    if (dto.startDate && dto.startDate.getTime() !== event.startDate.getTime() && dto.startDate <= new Date()) {
      throw new BadRequestException('A data de início deve estar no futuro');
    }
    this.assertDates(start, end);

    if (dto.maxParticipants != null) {
      const taken = await this.prisma.eventParticipant.count({ where: { eventId, ...ACTIVE_REG } });
      if (dto.maxParticipants < taken) {
        throw new BadRequestException(`Já existem ${taken} inscritos; o limite não pode ser inferior`);
      }
    }

    const updated = await this.prisma.event.update({ where: { eventId }, data: dto });

    const changed = SIGNIFICANT.filter((k) => {
      if (dto[k] === undefined) return false;
      const a = event[k], b = updated[k];
      return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b;
    });
    if (changed.length) {
      const ids = await this.participantIds(eventId);
      const cancelled = updated.status === EventStatus.canceled;
      await this.notifications.notifyMany(ids, NotificationType.EVENT_UPDATED, {
        title: cancelled ? 'Evento cancelado' : 'Evento actualizado',
        message: cancelled
          ? `O evento "${updated.title}" foi cancelado.`
          : `O evento "${updated.title}" sofreu alterações (${changed.join(', ')}). Confira os detalhes.`,
        relatedEntityId: eventId,
        metadata: { changed },
      });
    }
    return { success: true, data: updated };
  }

  async remove(user: AuthUser, eventId: string) {
    const event = await this.getManageable(eventId, user);
    if (await this.prisma.certificate.count({ where: { eventId } })) {
      throw new ConflictException('Este evento já emitiu certificados e não pode ser eliminado. Cancele-o ou conclua-o.');
    }
    const ids = await this.participantIds(eventId);
    await this.prisma.event.delete({ where: { eventId } }); // inscrições em cascata; certificados ficam (SetNull)

    await this.notifications.notifyMany(
      [...new Set([...ids, event.organizerId])].filter((id) => id !== user.userId),
      NotificationType.EVENT_DELETED,
      { title: 'Evento removido', message: `O evento "${event.title}" foi removido.` },
    );
    return { success: true, message: 'Evento deletado com sucesso' };
  }

  private async participantIds(eventId: string) {
    const rows = await this.prisma.eventParticipant.findMany({
      where: { eventId, status: EventParticipantStatus.registered },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ── Inscrições ─────────────────────────────────────────────────────────────

  async register(userId: string, eventId: string, opts: { allowPaid?: boolean } = {}) {
    const event = await this.prisma.event.findUnique({ where: { eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.organizerId === userId) throw new BadRequestException('Não pode inscrever-se no seu próprio evento');
    if (event.status !== EventStatus.scheduled || event.startDate <= new Date()) {
      throw new BadRequestException('Este evento não está aceitando inscrições');
    }
    if (event.price.gt(0) && !opts.allowPaid) {
      throw new HttpException(
        { message: 'Este evento é pago. Conclua o pagamento para se inscrever.', code: 'PAYMENT_REQUIRED' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Trava a linha do evento: duas inscrições simultâneas não ultrapassam o limite.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM events WHERE "eventId" = ${eventId}::uuid FOR UPDATE`;

      if (event.maxParticipants != null) {
        const taken = await tx.eventParticipant.count({ where: { eventId, ...ACTIVE_REG } });
        if (taken >= event.maxParticipants) throw new BadRequestException('Este evento atingiu o limite de participantes');
      }
      const existing = await tx.eventParticipant.findUnique({ where: { userId_eventId: { userId, eventId } } });
      if (existing && existing.status !== EventParticipantStatus.cancelled) {
        throw new ConflictException('Você já está registrado neste evento');
      }
      if (existing) {
        await tx.eventParticipant.update({
          where: { registrationId: existing.registrationId },
          data: { status: EventParticipantStatus.registered, attended: false, registeredAt: new Date() },
        });
      } else {
        await tx.eventParticipant.create({ data: { userId, eventId } });
      }
      await tx.activity.create({
        data: { userId, type: ActivityType.enrollment, entityType: ActivityEntityType.event, entityId: eventId },
      });
    });

    const me = await this.prisma.user.findUnique({ where: { userId }, select: { username: true } });
    await Promise.all([
      this.notifications.notify(userId, NotificationType.EVENT_REGISTRATION, {
        title: 'Inscrição confirmada',
        message: `Você está inscrito no evento "${event.title}".`,
        relatedEntityId: eventId,
      }),
      this.notifications.notify(event.organizerId, NotificationType.EVENT_REGISTRATION, {
        title: 'Nova inscrição',
        message: `${me?.username ?? 'Um utilizador'} inscreveu-se no evento "${event.title}".`,
        relatedEntityId: eventId,
      }),
    ]);
    return { success: true, message: 'Inscrição no evento realizada com sucesso' };
  }

  async cancelRegistration(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.startDate <= new Date() || event.status !== EventStatus.scheduled) {
      throw new BadRequestException('Não é possível cancelar a inscrição após o início do evento');
    }
    const res = await this.prisma.eventParticipant.updateMany({
      where: { userId, eventId, status: EventParticipantStatus.registered },
      data: { status: EventParticipantStatus.cancelled },
    });
    if (res.count === 0) throw new NotFoundException('Inscrição não encontrada');

    const me = await this.prisma.user.findUnique({ where: { userId }, select: { username: true } });
    await Promise.all([
      this.notifications.notify(userId, NotificationType.EVENT_REGISTRATION_CANCELLED, {
        title: 'Inscrição cancelada',
        message: `A sua inscrição no evento "${event.title}" foi cancelada.`,
        relatedEntityId: eventId,
      }),
      this.notifications.notify(event.organizerId, NotificationType.EVENT_REGISTRATION_CANCELLED, {
        title: 'Inscrição cancelada',
        message: `${me?.username ?? 'Um utilizador'} cancelou a inscrição no evento "${event.title}".`,
        relatedEntityId: eventId,
      }),
    ]);
    return { success: true, message: 'Inscrição cancelada com sucesso' };
  }

  /** Substitui `GET /events/:id/participants/:userId` (que permitia consultar qualquer utilizador). */
  async myRegistration(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { eventId }, select: { eventId: true } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    const reg = await this.prisma.eventParticipant.findUnique({ where: { userId_eventId: { userId, eventId } } });
    const registered = !!reg && reg.status !== EventParticipantStatus.cancelled;
    return {
      success: true,
      data: {
        isRegistered: registered,
        registrationDate: registered ? reg!.registeredAt : null,
        status: reg?.status ?? null,
        attended: registered ? reg!.attended : false,
      },
    };
  }

  async participants(user: AuthUser, eventId: string, q: { page: number; limit: number }) {
    await this.getManageable(eventId, user);
    const where: Prisma.EventParticipantWhereInput = { eventId, ...ACTIVE_REG };
    const [rows, total] = await Promise.all([
      this.prisma.eventParticipant.findMany({
        where,
        orderBy: { registeredAt: 'asc' },
        skip: skipOf(q),
        take: q.limit,
        include: { user: { select: { userId: true, username: true, email: true, avatarUrl: true, fullName: true } } },
      }),
      this.prisma.eventParticipant.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  /** Marca presença (base para os certificados de evento). Só com o evento a decorrer ou concluído. */
  async setAttendance(user: AuthUser, eventId: string, targetUserId: string, attended: boolean) {
    const event = await this.getManageable(eventId, user);
    if (event.status !== EventStatus.live && event.status !== EventStatus.completed) {
      throw new BadRequestException('A presença só pode ser marcada com o evento a decorrer ou concluído');
    }
    const res = await this.prisma.eventParticipant.updateMany({
      where: { eventId, userId: targetUserId, ...ACTIVE_REG },
      data: { attended, status: attended ? EventParticipantStatus.attended : EventParticipantStatus.registered },
    });
    if (res.count === 0) throw new NotFoundException('Inscrição não encontrada');
    return { success: true, data: { userId: targetUserId, attended } };
  }
}
