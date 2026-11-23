import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, InstructorLinkStatus, NotificationType, Prisma, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { countSeries, seriesWindow } from '@/common/utils/time-series';
import { displayName } from '../courses/course-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto, InstitutionCoursesQueryDto, ListInstructorsQueryDto, ListInvitesQueryDto, ListMembersQueryDto, RespondInviteDto, SendInviteDto } from './dto/institution.dto';

const PERSON = { userId: true, username: true, fullName: true, institutionName: true, avatarUrl: true, role: true } as const;
const LS = InstructorLinkStatus;
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const NOT_CANCELED = { status: { not: EnrollmentStatus.canceled } } as const;

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  /** Cursos da instituição: organizados por ela ou dados por ela. */
  private courseScope = (id: string): Prisma.CourseWhereInput => ({ OR: [{ organizerId: id }, { instructorId: id }] });

  private async institution(userId: string) {
    const i = await this.prisma.user.findUnique({ where: { userId }, select: { userId: true, role: true, status: true } });
    if (!i || i.role !== UserRole.institution || i.status !== UserStatus.approved) throw new NotFoundException({ message: 'Instituição não encontrada', code: 'INSTITUTION_NOT_FOUND' });
    return i;
  }

  /** Dados internos: só a própria instituição ou o admin. */
  private async owned(viewer: AuthUser, userId: string) {
    await this.institution(userId);
    if (viewer.userId !== userId && viewer.role !== UserRole.admin) throw new ForbiddenException('Sem acesso aos dados desta instituição');
  }

  // ── Convites ─────────────────────────────────────────────────────────────

  async sendInvite(inst: AuthUser, dto: SendInviteDto) {
    await this.institution(inst.userId);
    const instructor = await this.prisma.user.findFirst({
      where: { ...(dto.instructorId ? { userId: dto.instructorId } : { email: dto.email }), role: UserRole.instructor, status: UserStatus.approved },
      select: { userId: true },
    });
    if (!instructor) throw new NotFoundException({ message: 'Instrutor não encontrado', code: 'INSTRUCTOR_NOT_FOUND' });

    const key = { institutionId_instructorId: { institutionId: inst.userId, instructorId: instructor.userId } };
    const existing = await this.prisma.institutionInstructor.findUnique({ where: key });
    if (existing?.status === LS.accepted) throw new ConflictException({ message: 'O instrutor já está ligado à instituição', code: 'ALREADY_LINKED' });
    if (existing?.status === LS.pending) throw new ConflictException({ message: 'Já existe um convite pendente', code: 'ALREADY_INVITED' });

    let invite;
    try {
      invite = existing
        // convite recusado: volta a pendente (uma só linha por par)
        ? await this.prisma.institutionInstructor.update({ where: { id: existing.id }, data: { status: LS.pending, message: dto.message ?? null, invitedAt: new Date(), respondedAt: null } })
        : await this.prisma.institutionInstructor.create({ data: { institutionId: inst.userId, instructorId: instructor.userId, message: dto.message } });
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ message: 'Já existe um convite pendente', code: 'ALREADY_INVITED' });
      throw e;
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { userId: inst.userId }, select: PERSON });
    void this.notifications.notify(instructor.userId, NotificationType.INSTITUTION_INVITE, {
      title: 'Convite de instituição', message: `${displayName(me)} convidou-o a juntar-se como instrutor.${dto.message ? ` "${dto.message}"` : ''}`.slice(0, 500),
      relatedEntityId: invite.id, metadata: { institutionId: inst.userId },
    });
    return { success: true, data: invite };
  }

  async respond(instructor: AuthUser, dto: RespondInviteDto) {
    const inv = await this.prisma.institutionInstructor.findUnique({ where: { id: dto.inviteId } });
    if (!inv || inv.instructorId !== instructor.userId) throw new NotFoundException({ message: 'Convite não encontrado', code: 'INVITE_NOT_FOUND' });
    const { count } = await this.prisma.institutionInstructor.updateMany({
      where: { id: inv.id, status: LS.pending }, data: { status: dto.accept ? LS.accepted : LS.rejected, respondedAt: new Date() },
    });
    if (!count) throw new ConflictException({ message: 'O convite já foi respondido', code: 'ALREADY_RESPONDED' });
    const me = await this.prisma.user.findUniqueOrThrow({ where: { userId: instructor.userId }, select: PERSON });
    void this.notifications.notify(inv.institutionId, NotificationType.INSTITUTION_INVITE_RESPONSE, {
      title: dto.accept ? 'Convite aceite' : 'Convite recusado', message: `${displayName(me)} ${dto.accept ? 'aceitou' : 'recusou'} o convite.`, relatedEntityId: inv.id,
    });
    return { success: true, data: { inviteId: inv.id, status: dto.accept ? LS.accepted : LS.rejected } };
  }

  /** Instituição: convites enviados. Instrutor: convites recebidos. */
  async listInvites(user: AuthUser, q: ListInvitesQueryDto) {
    if (user.role !== UserRole.institution && user.role !== UserRole.instructor) throw new ForbiddenException('Só instituições e instrutores têm convites');
    const mine = user.role === UserRole.institution;
    const where: Prisma.InstitutionInstructorWhereInput = { ...(mine ? { institutionId: user.userId } : { instructorId: user.userId }), ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      this.prisma.institutionInstructor.findMany({
        where, orderBy: { invitedAt: 'desc' }, skip: skipOf(q), take: q.limit,
        include: mine ? { instructor: { select: PERSON } } : { institution: { select: PERSON } },
      }),
      this.prisma.institutionInstructor.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  /** Cancelar convite pendente, remover instrutor ou sair: qualquer das partes. */
  async removeLink(user: AuthUser, id: string) {
    const link = await this.prisma.institutionInstructor.findUnique({ where: { id } });
    if (!link || (link.institutionId !== user.userId && link.instructorId !== user.userId && user.role !== UserRole.admin)) {
      throw new NotFoundException({ message: 'Ligação não encontrada', code: 'INVITE_NOT_FOUND' });
    }
    await this.prisma.institutionInstructor.delete({ where: { id } });
    return { success: true, message: 'Ligação removida' };
  }

  // ── Dados públicos ───────────────────────────────────────────────────────

  async instructors(viewer: AuthUser | undefined, institutionId: string, q: ListInstructorsQueryDto) {
    await this.institution(institutionId);
    const privileged = !!viewer && (viewer.userId === institutionId || viewer.role === UserRole.admin);
    if (q.status !== LS.accepted && !privileged) throw new ForbiddenException('Só a própria instituição vê convites pendentes ou recusados');
    const where: Prisma.InstitutionInstructorWhereInput = { institutionId, status: q.status, instructor: { status: UserStatus.approved } };
    const [rows, total] = await Promise.all([
      this.prisma.institutionInstructor.findMany({
        where, orderBy: { invitedAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { id: true, status: true, invitedAt: true, respondedAt: true, instructor: { select: { ...PERSON, bio: true, expertise: true, teachingExperience: true } } },
      }),
      this.prisma.institutionInstructor.count({ where }),
    ]);
    const counts = rows.length ? await this.prisma.course.groupBy({ by: ['instructorId'], where: { instructorId: { in: rows.map((r) => r.instructor.userId) }, status: 'published', ...this.courseScope(institutionId) }, _count: { _all: true } }) : [];
    const c = new Map(counts.map((x) => [x.instructorId, x._count._all]));
    return paginated(rows.map((r) => ({ ...r, instructor: { ...r.instructor, name: displayName(r.instructor), coursesCount: c.get(r.instructor.userId) ?? 0 } })), total, q);
  }

  async courses(viewer: AuthUser | undefined, institutionId: string, q: InstitutionCoursesQueryDto) {
    await this.institution(institutionId);
    const privileged = !!viewer && (viewer.userId === institutionId || viewer.role === UserRole.admin);
    if (q.status && q.status !== 'published' && !privileged) throw new ForbiddenException('Só a própria instituição vê cursos por publicar');
    const where: Prisma.CourseWhereInput = { AND: [this.courseScope(institutionId), privileged ? (q.status ? { status: q.status } : {}) : { status: 'published', isPublic: true }] };
    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { courseId: true, title: true, slug: true, coverImageUrl: true, status: true, level: true, price: true, ratingAverage: true, ratingCount: true, createdAt: true, instructor: { select: PERSON }, _count: { select: { enrollments: NOT_CANCELED_WHERE } } },
      }),
      this.prisma.course.count({ where }),
    ]);
    return paginated(rows.map(({ _count, ...c }) => ({ ...c, ratingAverage: Number(c.ratingAverage), price: Number(c.price), enrollmentsCount: _count.enrollments })), total, q);
  }

  // ── Dados internos (instituição / admin) ─────────────────────────────────

  async stats(viewer: AuthUser, id: string) {
    await this.owned(viewer, id);
    const scope = this.courseScope(id);
    const inScope = { course: scope };
    const [courses, instructors, pendingInvites, students, enrollments, completed, certificates, events, ratings] = await Promise.all([
      this.prisma.course.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      this.prisma.institutionInstructor.count({ where: { institutionId: id, status: LS.accepted } }),
      this.prisma.institutionInstructor.count({ where: { institutionId: id, status: LS.pending } }),
      this.prisma.user.count({ where: { enrollments: { some: { ...inScope, ...NOT_CANCELED } } } }),
      this.prisma.enrollment.count({ where: { ...inScope, ...NOT_CANCELED } }),
      this.prisma.enrollment.count({ where: { ...inScope, status: 'completed' } }),
      this.prisma.certificate.count({ where: { ...inScope, status: 'issued' } }),
      this.prisma.event.groupBy({ by: ['status'], where: { organizerId: id }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ avg: number | null; n: number }[]>`
        SELECT (SUM("ratingAverage" * "ratingCount") / NULLIF(SUM("ratingCount"), 0))::float AS avg, COALESCE(SUM("ratingCount"), 0)::int AS n
        FROM courses WHERE ("organizerId" = ${id}::uuid OR "instructorId" = ${id}::uuid) AND "ratingCount" > 0`,
    ]);
    const by = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const cs = by(courses);
    return {
      success: true,
      data: {
        courses: { total: Object.values(cs).reduce((a, b) => a + b, 0), byStatus: cs },
        instructors, pendingInvites, students, enrollments, completedEnrollments: completed,
        completionRate: enrollments ? Math.round((completed / enrollments) * 100) : 0,
        certificatesIssued: certificates, events: by(events),
        rating: { average: Math.round((ratings[0]?.avg ?? 0) * 10) / 10, count: ratings[0]?.n ?? 0 },
      },
    };
  }

  async recentEnrollments(viewer: AuthUser, id: string, limit: number) {
    await this.owned(viewer, id);
    const rows = await this.prisma.enrollment.findMany({
      where: { course: this.courseScope(id), ...NOT_CANCELED }, orderBy: { enrolledAt: 'desc' }, take: limit,
      select: { enrollmentId: true, enrolledAt: true, status: true, progress: true, user: { select: PERSON }, course: { select: { courseId: true, title: true, slug: true } } },
    });
    return { success: true, data: rows };
  }

  async topCourses(viewer: AuthUser, id: string, limit: number) {
    await this.owned(viewer, id);
    const rows = await this.prisma.course.findMany({
      where: { ...this.courseScope(id), status: 'published' }, take: limit,
      orderBy: [{ enrollments: { _count: 'desc' } }, { ratingAverage: 'desc' }],
      select: { courseId: true, title: true, slug: true, coverImageUrl: true, ratingAverage: true, ratingCount: true, _count: { select: { enrollments: NOT_CANCELED_WHERE } } },
    });
    const done = rows.length ? await this.prisma.enrollment.groupBy({ by: ['courseId'], where: { courseId: { in: rows.map((r) => r.courseId) }, status: 'completed' }, _count: { _all: true } }) : [];
    const d = new Map(done.map((x) => [x.courseId, x._count._all]));
    return { success: true, data: rows.map(({ _count, ...c }) => ({ ...c, ratingAverage: Number(c.ratingAverage), enrollmentsCount: _count.enrollments, completedCount: d.get(c.courseId) ?? 0 })) };
  }

  async analytics(viewer: AuthUser, id: string, q: AnalyticsQueryDto) {
    await this.owned(viewer, id);
    const win = seriesWindow(q.period);
    const mine = Prisma.sql`"courseId" IN (SELECT "courseId" FROM courses WHERE "organizerId" = ${id}::uuid OR "instructorId" = ${id}::uuid)`;
    const [enrollments, completions, certificates] = await Promise.all([
      countSeries(this.prisma, win, { from: Prisma.sql`enrollments`, column: Prisma.sql`"enrolledAt"`, where: Prisma.sql`${mine} AND "status" <> 'canceled'` }),
      countSeries(this.prisma, win, { from: Prisma.sql`enrollments`, column: Prisma.sql`"completedAt"`, where: mine }),
      countSeries(this.prisma, win, { from: Prisma.sql`certificates`, column: Prisma.sql`"issueDate"`, where: Prisma.sql`${mine} AND "status" = 'issued'` }),
    ]);
    return { success: true, data: { period: q.period, granularity: win.unit, labels: win.labels, series: { enrollments, completions, certificates } } };
  }

  async members(viewer: AuthUser, id: string, q: ListMembersQueryDto) {
    await this.owned(viewer, id);
    const like = q.q ? { contains: escapeLike(q.q), mode: 'insensitive' as const } : undefined;
    const search: Prisma.UserWhereInput = like ? { OR: [{ username: like }, { fullName: like }] } : {};
    const where: Prisma.UserWhereInput = q.role === 'instructor'
      ? { AND: [search, { institutions: { some: { institutionId: id, status: LS.accepted } } }] }
      : { AND: [search, { enrollments: { some: { course: this.courseScope(id), ...NOT_CANCELED } } }] };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { username: 'asc' }, skip: skipOf(q), take: q.limit, select: { ...PERSON, createdAt: true } }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async settings(viewer: AuthUser, id: string) {
    await this.owned(viewer, id);
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { userId: id },
      select: { ...PERSON, email: true, bio: true, institutionType: true, academicPrograms: true, website: true, contactPhone: true, nuit: true, legalRepresentative: true, accreditation: true, yearFounded: true, status: true, kycStatus: true },
    });
    return { success: true, data: u };
  }

  async certificates(viewer: AuthUser, id: string, q: { page: number; limit: number }) {
    await this.owned(viewer, id);
    const where: Prisma.CertificateWhereInput = { course: this.courseScope(id) };
    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where, orderBy: { issueDate: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { certificateId: true, credentialId: true, issueDate: true, status: true, hours: true, user: { select: PERSON }, course: { select: { courseId: true, title: true } } },
      }),
      this.prisma.certificate.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...r, hours: Number(r.hours) })), total, q);
  }
}

const NOT_CANCELED_WHERE = { where: { status: { not: EnrollmentStatus.canceled } } } as const;
