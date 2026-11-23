import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, NotificationType, Prisma, PublicationStatus, UserRole } from '@prisma/client';
import { canManage, courseWhere } from '../courses/course-access';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminReviewsQueryDto, CreateReviewDto, ListReviewsQueryDto, ReceivedReviewsQueryDto, ReplyDto, UpdateReviewDto,
} from './dto/review.dto';

export type ReviewKind = 'course' | 'event';

const AUTHOR = { userId: true, username: true, fullName: true, avatarUrl: true } as const;
const PUBLIC_SELECT = {
  reviewId: true, entityType: true, rating: true, comment: true, instructorReply: true, replyDate: true, createdAt: true, updatedAt: true,
  user: { select: AUTHOR },
} as const;

const orderFor = (sort: ListReviewsQueryDto['sort']): Prisma.ReviewOrderByWithRelationInput[] =>
  sort === 'highest' ? [{ rating: 'desc' }, { createdAt: 'desc' }] : sort === 'lowest' ? [{ rating: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  // ── Alvo (curso/evento) ──────────────────────────────────────────────────

  private async course(idOrSlug: string, db: Db = this.prisma) {
    const c = await db.course.findFirst({
      where: courseWhere(idOrSlug),
      select: { courseId: true, title: true, instructorId: true, organizerId: true, status: true, isPublic: true },
    });
    if (!c) throw new NotFoundException('Curso não encontrado');
    return c;
  }

  private async event(eventId: string, db: Db = this.prisma) {
    const e = await db.event.findUnique({ where: { eventId }, select: { eventId: true, title: true, organizerId: true, status: true, startDate: true } });
    if (!e) throw new NotFoundException('Evento não encontrado');
    return e;
  }

  /** Cursos não publicados/privados só são visíveis para quem os gere (como no detalhe do curso). */
  private async visibleCourse(idOrSlug: string, viewer?: AuthUser) {
    const c = await this.course(idOrSlug);
    if ((c.status !== PublicationStatus.published || !c.isPublic) && !canManage(viewer, c)) throw new NotFoundException('Curso não encontrado');
    return c;
  }

  private async resolve(kind: ReviewKind, id: string, viewer?: AuthUser) {
    return kind === 'course'
      ? { kind, id: (await this.visibleCourse(id, viewer)).courseId }
      : { kind, id: (await this.event(id)).eventId };
  }

  private where(t: { kind: ReviewKind; id: string }): Prisma.ReviewWhereInput {
    return t.kind === 'course' ? { entityType: 'course', courseId: t.id } : { entityType: 'event', eventId: t.id };
  }

  // ── Leitura pública ──────────────────────────────────────────────────────

  async list(kind: ReviewKind, id: string, q: ListReviewsQueryDto, viewer?: AuthUser) {
    const t = await this.resolve(kind, id, viewer);
    const where: Prisma.ReviewWhereInput = { ...this.where(t), isPublic: true, ...(q.rating && { rating: q.rating }) };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy: orderFor(q.sort), skip: skipOf(q), take: q.limit, select: PUBLIC_SELECT }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async summary(kind: ReviewKind, id: string, viewer?: AuthUser) {
    const t = await this.resolve(kind, id, viewer);
    const rows = await this.prisma.review.groupBy({ by: ['rating'], where: { ...this.where(t), isPublic: true }, _count: { _all: true } });
    return { success: true, data: summarize(rows.map((r) => [r.rating, r._count._all])) };
  }

  // ── Elegibilidade ────────────────────────────────────────────────────────

  /** Regras (as mesmas no `can-review` e na criação). `reason` é um código estável para o frontend. */
  private async eligibility(db: Db, kind: ReviewKind, id: string, userId: string) {
    if (kind === 'course') {
      const c = await this.course(id, db);
      if (c.instructorId === userId || c.organizerId === userId) return { ok: false, reason: 'OWN_ENTITY' as const, target: c };
      const [enrollment, existing] = await Promise.all([
        db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: c.courseId } }, select: { status: true } }),
        db.review.findFirst({ where: { userId, courseId: c.courseId }, select: { reviewId: true } }),
      ]);
      if (existing) return { ok: false, reason: 'ALREADY_REVIEWED' as const, reviewId: existing.reviewId, target: c };
      if (!enrollment) return { ok: false, reason: 'NOT_ENROLLED' as const, target: c };
      if (enrollment.status !== 'completed') return { ok: false, reason: 'COURSE_NOT_COMPLETED' as const, target: c };
      return { ok: true, reason: null, target: c };
    }
    const e = await this.event(id, db);
    if (e.organizerId === userId) return { ok: false, reason: 'OWN_ENTITY' as const, target: e };
    const [part, existing] = await Promise.all([
      db.eventParticipant.findUnique({ where: { userId_eventId: { userId, eventId: e.eventId } }, select: { status: true } }),
      db.review.findFirst({ where: { userId, eventId: e.eventId }, select: { reviewId: true } }),
    ]);
    if (existing) return { ok: false, reason: 'ALREADY_REVIEWED' as const, reviewId: existing.reviewId, target: e };
    if (!part || part.status === 'cancelled') return { ok: false, reason: 'NOT_REGISTERED' as const, target: e };
    if (e.status === EventStatus.canceled) return { ok: false, reason: 'EVENT_CANCELED' as const, target: e };
    if (e.status !== EventStatus.completed && e.startDate > new Date()) return { ok: false, reason: 'EVENT_NOT_STARTED' as const, target: e };
    return { ok: true, reason: null, target: e };
  }

  async canReview(kind: ReviewKind, id: string, user: AuthUser) {
    const r = await this.eligibility(this.prisma, kind, id, user.userId);
    return { success: true, data: { canReview: r.ok, reason: r.reason, ...('reviewId' in r && { reviewId: r.reviewId }) } };
  }

  // ── Criar / editar / apagar ──────────────────────────────────────────────

  async create(kind: ReviewKind, id: string, user: AuthUser, dto: CreateReviewDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Cursos: serializa avaliações do mesmo curso (a média guardada é recalculada sob este bloqueio).
      if (kind === 'course') await tx.$queryRaw`SELECT 1 FROM courses WHERE "courseId" = ${await this.courseId(id)}::uuid FOR UPDATE`;
      const el = await this.eligibility(tx, kind, id, user.userId);
      if (!el.ok) throw this.ineligible(el.reason);
      const base = kind === 'course'
        ? { entityType: 'course' as const, courseId: (el.target as { courseId: string }).courseId }
        : { entityType: 'event' as const, eventId: (el.target as { eventId: string }).eventId };
      const review = await tx.review.create({
        data: { ...base, userId: user.userId, rating: dto.rating, comment: dto.comment || null },
        select: PUBLIC_SELECT,
      });
      if (kind === 'course') await refreshCourseRating(tx, base.courseId!);
      return { review, target: el.target };
    });
    await this.notifyOwners(kind, result.target, `Nova avaliação (${dto.rating}★)`, result.review.reviewId);
    return { success: true, data: result.review };
  }

  async update(user: AuthUser, reviewId: string, dto: UpdateReviewDto) {
    if (dto.rating === undefined && dto.comment === undefined) throw new BadRequestException('Indique rating e/ou comment');
    const r = await this.own(reviewId, user);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (r.courseId) await tx.$queryRaw`SELECT 1 FROM courses WHERE "courseId" = ${r.courseId}::uuid FOR UPDATE`;
      const u = await tx.review.update({
        where: { reviewId },
        data: { ...(dto.rating !== undefined && { rating: dto.rating }), ...(dto.comment !== undefined && { comment: dto.comment || null }) },
        select: PUBLIC_SELECT,
      });
      if (r.courseId) await refreshCourseRating(tx, r.courseId);
      return u;
    });
    return { success: true, data: updated };
  }

  /** Autor ou admin. */
  async remove(user: AuthUser, reviewId: string) {
    const r = await this.prisma.review.findUnique({ where: { reviewId }, select: { reviewId: true, userId: true, courseId: true } });
    if (!r) throw new NotFoundException('Avaliação não encontrada');
    if (r.userId !== user.userId && user.role !== UserRole.admin) throw new ForbiddenException('Só o autor ou um administrador pode apagar esta avaliação');
    await this.prisma.$transaction(async (tx) => {
      if (r.courseId) await tx.$queryRaw`SELECT 1 FROM courses WHERE "courseId" = ${r.courseId}::uuid FOR UPDATE`;
      await tx.review.delete({ where: { reviewId } });
      if (r.courseId) await refreshCourseRating(tx, r.courseId);
    });
    return { success: true, message: 'Avaliação removida' };
  }

  // ── Resposta do dono ─────────────────────────────────────────────────────

  private async ownerReview(reviewId: string, user: AuthUser) {
    const r = await this.prisma.review.findUnique({
      where: { reviewId },
      select: {
        reviewId: true, userId: true, instructorReply: true,
        course: { select: { courseId: true, title: true, instructorId: true, organizerId: true } },
        event: { select: { eventId: true, title: true, organizerId: true } },
      },
    });
    if (!r) throw new NotFoundException('Avaliação não encontrada');
    const owner = r.course ? canManage(user, r.course) : r.event ? user.role === UserRole.admin || r.event.organizerId === user.userId : false;
    if (!owner) throw new ForbiddenException('Só o dono do curso/evento pode responder');
    return { ...r, title: r.course?.title ?? r.event?.title ?? '' };
  }

  /** Cria ou edita a resposta (uma por avaliação). */
  async reply(user: AuthUser, reviewId: string, dto: ReplyDto) {
    const r = await this.ownerReview(reviewId, user);
    const updated = await this.prisma.review.update({
      where: { reviewId }, data: { instructorReply: dto.reply, replyDate: new Date() }, select: PUBLIC_SELECT,
    });
    if (!r.instructorReply && r.userId !== user.userId) {
      await this.notifications.notify(r.userId, NotificationType.REVIEW_REPLY, {
        title: 'Resposta à sua avaliação', message: `A sua avaliação de "${r.title}" recebeu uma resposta.`, relatedEntityId: r.course?.courseId ?? r.event?.eventId,
      });
    }
    return { success: true, data: updated };
  }

  async removeReply(user: AuthUser, reviewId: string) {
    const r = await this.ownerReview(reviewId, user);
    if (!r.instructorReply) throw new NotFoundException('Esta avaliação não tem resposta');
    await this.prisma.review.update({ where: { reviewId }, data: { instructorReply: null, replyDate: null } });
    return { success: true, message: 'Resposta removida' };
  }

  // ── Moderação (admin) ────────────────────────────────────────────────────

  async setVisibility(reviewId: string, isPublic: boolean) {
    const r = await this.prisma.review.findUnique({ where: { reviewId }, select: { courseId: true } });
    if (!r) throw new NotFoundException('Avaliação não encontrada');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (r.courseId) await tx.$queryRaw`SELECT 1 FROM courses WHERE "courseId" = ${r.courseId}::uuid FOR UPDATE`;
      const u = await tx.review.update({ where: { reviewId }, data: { isPublic }, select: { reviewId: true, isPublic: true } });
      if (r.courseId) await refreshCourseRating(tx, r.courseId);
      return u;
    });
    return { success: true, data: updated };
  }

  async adminList(q: AdminReviewsQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      ...(q.isPublic !== undefined && { isPublic: q.isPublic }), ...(q.entity && { entityType: q.entity }), ...(q.rating && { rating: q.rating }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { ...PUBLIC_SELECT, isPublic: true, course: { select: { courseId: true, title: true, slug: true } }, event: { select: { eventId: true, title: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  // ── Caixa de entrada do dono e analytics ─────────────────────────────────

  /** Avaliações recebidas nos meus cursos/eventos (admin: todas). */
  async received(user: AuthUser, q: ReceivedReviewsQueryDto) {
    const admin = user.role === UserRole.admin;
    const mine: Prisma.ReviewWhereInput[] = admin ? [] : [
      { course: { OR: [{ instructorId: user.userId }, { organizerId: user.userId }] } },
      { event: { organizerId: user.userId } },
    ];
    const where: Prisma.ReviewWhereInput = {
      ...(mine.length && { OR: mine }),
      ...(q.entity && { entityType: q.entity }),
      ...(q.rating && { rating: q.rating }),
      ...(q.replied !== undefined && { instructorReply: q.replied ? { not: null } : null }),
      isPublic: true,
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { ...PUBLIC_SELECT, course: { select: { courseId: true, title: true, slug: true } }, event: { select: { eventId: true, title: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  /** Cursos do instrutor / da instituição (admin: todos). Só avaliações públicas de cursos. */
  async analytics(user: AuthUser) {
    const scope = user.role === UserRole.admin
      ? Prisma.sql`TRUE`
      : Prisma.sql`(c."instructorId" = ${user.userId}::uuid OR c."organizerId" = ${user.userId}::uuid)`;
    const base = Prisma.sql`FROM reviews r JOIN courses c ON c."courseId" = r."courseId" WHERE r."isPublic" AND ${scope}`;
    const [dist, byCourse, monthly] = await Promise.all([
      this.prisma.$queryRaw<{ rating: number; count: number; unanswered: number }[]>(Prisma.sql`
        SELECT r.rating, COUNT(*)::int AS count, (COUNT(*) FILTER (WHERE r."instructorReply" IS NULL))::int AS unanswered ${base} GROUP BY r.rating`),
      this.prisma.$queryRaw<{ courseId: string; title: string; count: number; average: number }[]>(Prisma.sql`
        SELECT c."courseId", c.title, COUNT(*)::int AS count, ROUND(AVG(r.rating)::numeric, 1)::float AS average ${base}
        GROUP BY c."courseId", c.title ORDER BY count DESC, c.title LIMIT 20`),
      this.prisma.$queryRaw<{ month: string; count: number; average: number }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', r."createdAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count, ROUND(AVG(r.rating)::numeric, 1)::float AS average
        ${base} AND r."createdAt" >= date_trunc('month', now()) - interval '5 months' GROUP BY 1 ORDER BY 1`),
    ]);
    return {
      success: true,
      data: { ...summarize(dist.map((d) => [d.rating, d.count])), unanswered: dist.reduce((n, d) => n + d.unanswered, 0), byCourse, monthly },
    };
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  private async courseId(idOrSlug: string) {
    return (await this.course(idOrSlug)).courseId;
  }

  private async own(reviewId: string, user: AuthUser) {
    const r = await this.prisma.review.findUnique({ where: { reviewId }, select: { reviewId: true, userId: true, courseId: true } });
    if (!r) throw new NotFoundException('Avaliação não encontrada');
    if (r.userId !== user.userId) throw new ForbiddenException('Só o autor pode editar esta avaliação');
    return r;
  }

  private ineligible(reason: string | null) {
    const messages: Record<string, [number, string]> = {
      OWN_ENTITY: [403, 'Não pode avaliar o seu próprio conteúdo'],
      ALREADY_REVIEWED: [409, 'Já avaliou este item; edite a avaliação existente'],
      NOT_ENROLLED: [403, 'Tem de estar inscrito no curso para o avaliar'],
      COURSE_NOT_COMPLETED: [403, 'Conclua o curso para o poder avaliar'],
      NOT_REGISTERED: [403, 'Tem de estar inscrito no evento para o avaliar'],
      EVENT_CANCELED: [403, 'Este evento foi cancelado'],
      EVENT_NOT_STARTED: [403, 'O evento ainda não começou'],
    };
    const [status, message] = messages[reason ?? ''] ?? [403, 'Não pode avaliar este item'];
    const body = { message, code: reason ?? 'NOT_ELIGIBLE' };
    return status === 409 ? new ConflictException(body) : new ForbiddenException(body);
  }

  private async notifyOwners(kind: ReviewKind, target: object, title: string, reviewId: string) {
    const t = target as { courseId?: string; eventId?: string; title: string; instructorId?: string; organizerId?: string | null };
    const owners = [t.instructorId, t.organizerId].filter((x): x is string => !!x);
    await this.notifications.notifyMany(owners, NotificationType.NEW_REVIEW, {
      title, message: `${kind === 'course' ? 'O curso' : 'O evento'} "${t.title}" recebeu uma nova avaliação.`,
      relatedEntityId: t.courseId ?? t.eventId, metadata: { reviewId, kind },
    });
  }
}

/** Média e distribuição (1–5) a partir de pares [nota, quantidade]. */
export function summarize(pairs: [number, number][]) {
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0, sum = 0;
  for (const [rating, n] of pairs) { distribution[String(rating)] = n; count += n; sum += rating * n; }
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution };
}

/** Recalcula a média/contagem guardadas no curso. Chamar SEMPRE com a linha do curso bloqueada (FOR UPDATE). */
async function refreshCourseRating(tx: Prisma.TransactionClient, courseId: string) {
  await tx.$executeRaw`
    UPDATE courses SET
      "ratingAverage" = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE "courseId" = ${courseId}::uuid AND "isPublic"), 0),
      "ratingCount"   = (SELECT COUNT(*) FROM reviews WHERE "courseId" = ${courseId}::uuid AND "isPublic")
    WHERE "courseId" = ${courseId}::uuid`;
}
