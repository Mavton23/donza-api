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
  EnrollmentStatus,
  NotificationType,
  Prisma,
  PublicationStatus,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { canManage, courseWhere } from './course-access';
import { EnrolledQueryDto } from './dto/course.dto';
import { UpdateEnrollmentDto } from './dto/enrollment.dto';

/** Aulas que contam para o progresso: publicadas, em módulos publicados. */
const countable = (courseId: string): Prisma.LessonWhereInput => ({
  isPublished: true,
  module: { courseId, isPublished: true },
});

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly certificates: CertificatesService,
  ) {}

  // ───────────────────────────── Matrícula ─────────────────────────────

  /**
   * `allowPaid` é para o módulo de pagamentos: só ele pode matricular em cursos pagos,
   * depois de confirmar o pagamento. (O Express matriculava de graça em qualquer curso.)
   */
  async enroll(userId: string, courseId: string, opts: { allowPaid?: boolean } = {}) {
    const course = await this.prisma.course.findFirst({
      where: { courseId, status: PublicationStatus.published, isPublic: true },
      select: { courseId: true, title: true, instructorId: true, organizerId: true, price: true },
    });
    if (!course) throw new NotFoundException('Curso não encontrado ou não disponível para matrícula');

    if (course.instructorId === userId || course.organizerId === userId) {
      throw new BadRequestException('Não pode matricular-se no seu próprio curso');
    }
    if (course.price.gt(0) && !opts.allowPaid) {
      throw new HttpException(
        { message: 'Este curso é pago. Conclua o pagamento para se matricular.', code: 'PAYMENT_REQUIRED' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { enrollmentId: true, status: true },
    });
    if (existing && existing.status !== EnrollmentStatus.canceled) {
      throw new ConflictException('Você já está matriculado neste curso');
    }

    // Matrícula cancelada é reactivada (mantém progresso); evita violar o unique (userId, courseId).
    const enrollment = existing
      ? await this.prisma.enrollment.update({
          where: { enrollmentId: existing.enrollmentId },
          data: { status: EnrollmentStatus.active, enrolledAt: new Date(), lastAccessed: new Date() },
        })
      : await this.prisma.enrollment.create({ data: { userId, courseId, status: EnrollmentStatus.active } });

    await this.prisma.activity.create({
      data: {
        userId,
        courseId,
        type: ActivityType.enrollment,
        entityType: ActivityEntityType.course,
        entityId: courseId,
      },
    });

    const student = await this.prisma.user.findUnique({ where: { userId }, select: { username: true } });
    await this.notifications.notifyMany(
      [course.instructorId, course.organizerId].filter((x): x is string => !!x),
      NotificationType.COURSE_ENROLLMENT,
      {
        title: 'Nova matrícula',
        message: `${student?.username ?? 'Um aluno'} inscreveu-se no seu curso "${course.title}".`,
        relatedEntityId: courseId,
        metadata: { courseId, studentId: userId },
      },
    );

    return { success: true, data: enrollment };
  }

  /** Cancela (não apaga): mantém histórico e progresso para uma eventual reactivação. */
  async cancel(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: { course: { select: { title: true, instructorId: true, organizerId: true } } },
    });
    if (!enrollment || enrollment.status === EnrollmentStatus.canceled) {
      throw new NotFoundException('Matrícula não encontrada');
    }
    await this.prisma.enrollment.update({
      where: { enrollmentId: enrollment.enrollmentId },
      data: { status: EnrollmentStatus.canceled },
    });
    await this.notifications.notifyMany(
      [enrollment.course.instructorId, enrollment.course.organizerId].filter((x): x is string => !!x),
      NotificationType.COURSE_UNENROLLMENT,
      {
        title: 'Matrícula cancelada',
        message: `Um aluno cancelou a matrícula no curso "${enrollment.course.title}".`,
        relatedEntityId: courseId,
        metadata: { courseId, studentId: userId },
      },
    );
    return { success: true, message: 'Matrícula cancelada com sucesso' };
  }

  async myEnrollment(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { courseId }, select: { courseId: true } });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    const isEnrolled = !!enrollment && enrollment.status !== EnrollmentStatus.canceled;
    return { isEnrolled, enrollment: isEnrolled ? enrollment : null };
  }

  async updateMine(userId: string, courseId: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.requireEnrollment(userId, courseId);
    const updated = await this.prisma.enrollment.update({
      where: { enrollmentId: enrollment.enrollmentId },
      data: dto,
    });
    return { success: true, data: updated };
  }

  /** Cursos em que o utilizador está matriculado. Só o próprio ou admin. */
  async enrolledCourses(viewer: AuthUser, userId: string, q: EnrolledQueryDto) {
    if (viewer.userId !== userId && viewer.role !== UserRole.admin) {
      throw new ForbiddenException('Você não tem permissão para ver estas matrículas');
    }
    const search = q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined;
    const where: Prisma.EnrollmentWhereInput = {
      userId,
      status: q.status ?? { not: EnrollmentStatus.canceled },
      course: {
        ...(q.category && { category: q.category }),
        ...(q.level && { level: q.level }),
        ...(search && { OR: [{ title: search }, { shortDescription: search }] }),
      },
    };
    const orderBy: Prisma.EnrollmentOrderByWithRelationInput =
      q.sort === 'progress'
        ? { progress: 'desc' }
        : q.sort === 'rating'
          ? { course: { ratingAverage: 'desc' } }
          : q.sort === 'title'
            ? { course: { title: 'asc' } }
            : { enrolledAt: 'desc' };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        orderBy,
        skip: skipOf(q),
        take: q.limit,
        include: {
          course: {
            include: { instructor: { select: { userId: true, username: true, fullName: true, avatarUrl: true } } },
          },
        },
      }),
    ]);

    const data = rows.map(({ course, ...e }) => ({
      ...course,
      progress: e.progress,
      enrollmentStatus: e.status,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
      lastAccessed: e.lastAccessed,
      favorite: e.favorite,
    }));
    return paginated(data, total, q);
  }

  // ───────────────────────────── Progresso ─────────────────────────────

  async progress(userId: string, idOrSlug: string) {
    const course = await this.prisma.course.findUnique({ where: courseWhere(idOrSlug), select: { courseId: true } });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const enrollment = await this.requireEnrollment(userId, course.courseId);

    const [totalLessons, done] = await Promise.all([
      this.prisma.lesson.count({ where: countable(course.courseId) }),
      this.prisma.userLesson.findMany({
        where: { userId, completed: true, lesson: countable(course.courseId) },
        select: { lessonId: true },
      }),
    ]);
    const progress = this.percent(done.length, totalLessons);

    // Auto-correcção se ficou desactualizado (ex.: o instrutor publicou aulas novas).
    const synced =
      enrollment.progress === progress
        ? enrollment
        : await this.prisma.enrollment.update({ where: { enrollmentId: enrollment.enrollmentId }, data: { progress } });

    return {
      success: true,
      data: {
        courseId: course.courseId,
        progress,
        completedLessons: done.length,
        totalLessons,
        completedLessonIds: done.map((d) => d.lessonId),
        enrollment: synced,
      },
    };
  }

  async setLessonCompleted(userId: string, courseId: string, lessonId: string, completed: boolean) {
    const enrollment = await this.requireEnrollment(userId, courseId);
    const lesson = await this.prisma.lesson.findFirst({
      where: { lessonId, ...countable(courseId) },
      select: { lessonId: true },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada neste curso');

    const result = await this.prisma.$transaction(async (tx) => {
      const prev = await tx.userLesson.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
      const newlyCompleted = completed && !prev?.completed;

      await tx.userLesson.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, completed, completedAt: completed ? new Date() : null },
        update: completed
          ? { completed: true, completedAt: prev?.completed ? prev.completedAt : new Date() }
          : { completed: false, completedAt: null },
      });

      const [totalLessons, doneCount] = await Promise.all([
        tx.lesson.count({ where: countable(courseId) }),
        tx.userLesson.count({ where: { userId, completed: true, lesson: countable(courseId) } }),
      ]);
      const progress = this.percent(doneCount, totalLessons);
      // Uma vez concluído, o curso não volta a "active" só porque o instrutor acrescentou aulas.
      const justCompletedCourse = progress === 100 && enrollment.status === EnrollmentStatus.active;

      await tx.enrollment.update({
        where: { enrollmentId: enrollment.enrollmentId },
        data: {
          progress,
          lastAccessed: new Date(),
          ...(justCompletedCourse && { status: EnrollmentStatus.completed, completedAt: new Date() }),
        },
      });

      if (newlyCompleted) {
        await tx.activity.create({
          data: { userId, courseId, type: ActivityType.lesson_completed, entityType: ActivityEntityType.lesson, entityId: lessonId },
        });
      }
      if (justCompletedCourse) {
        await tx.activity.create({
          data: { userId, courseId, type: ActivityType.course_completed, entityType: ActivityEntityType.course, entityId: courseId },
        });
      }
      return { progress, completedLessons: doneCount, totalLessons, courseCompleted: justCompletedCourse };
    });

    if (result.courseCompleted) {
      await this.certificates.issueForCourse(userId, courseId);
      const course = await this.prisma.course.findUnique({ where: { courseId }, select: { title: true } });
      await this.notifications.notify(userId, NotificationType.COURSE_COMPLETION, {
        title: 'Curso concluído',
        message: `Parabéns! Você completou o curso "${course?.title ?? ''}".`,
        relatedEntityId: courseId,
        metadata: { courseId },
      });
    }
    return { success: true, data: result };
  }

  /**
   * Estatísticas de conclusão.
   *  - Aluno: módulos concluídos, módulo actual e o seu progresso.
   *  - Gestor: totais agregados do curso (alunos, concluídos, taxa de conclusão).
   */
  async completionStats(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { courseId },
      select: {
        instructorId: true,
        organizerId: true,
        modules: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          select: { moduleId: true, title: true, lessons: { where: { isPublished: true }, select: { lessonId: true } } },
        },
      },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const totalModules = course.modules.length;

    if (canManage(user, course)) {
      const [enrolled, completed] = await Promise.all([
        this.prisma.enrollment.count({ where: { courseId, status: { not: EnrollmentStatus.canceled } } }),
        this.prisma.enrollment.count({ where: { courseId, status: EnrollmentStatus.completed } }),
      ]);
      return {
        success: true,
        data: {
          totalModules,
          currentModule: course.modules[0]?.title ?? null,
          enrolledStudents: enrolled,
          completedStudents: completed,
          progress: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
        },
      };
    }

    const enrollment = await this.requireEnrollment(user.userId, courseId);
    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.lessonId));
    const done = new Set(
      (
        await this.prisma.userLesson.findMany({
          where: { userId: user.userId, completed: true, lessonId: { in: lessonIds } },
          select: { lessonId: true },
        })
      ).map((d) => d.lessonId),
    );
    const withLessons = course.modules.filter((m) => m.lessons.length > 0);
    const isComplete = (m: (typeof withLessons)[number]) => m.lessons.every((l) => done.has(l.lessonId));
    return {
      success: true,
      data: {
        totalModules,
        completedModules: withLessons.filter(isComplete).length,
        currentModule: withLessons.find((m) => !isComplete(m))?.title ?? null,
        progress: enrollment.progress,
      },
    };
  }

  /**
   * Recalcula o progresso de todos os alunos de um curso (depois de publicar/ocultar/apagar
   * aulas ou módulos). Uma única query em vez de N updates.
   */
  async resyncCourse(courseId: string): Promise<void> {
    await this.prisma.$executeRaw`
      WITH pub AS (
        SELECT l."lessonId"
        FROM lessons l JOIN modules m ON m."moduleId" = l."moduleId"
        WHERE m."courseId" = ${courseId}::uuid AND m."isPublished" AND l."isPublished"
      ),
      total AS (SELECT COUNT(*)::int AS n FROM pub)
      UPDATE enrollments e
      SET progress = CASE
            WHEN t.n = 0 THEN 0
            ELSE LEAST(100, ROUND(100.0 * (
              SELECT COUNT(*) FROM user_lessons ul
              WHERE ul."userId" = e."userId" AND ul.completed AND ul."lessonId" IN (SELECT "lessonId" FROM pub)
            ) / t.n))::int
          END,
          "updatedAt" = now()
      FROM total t
      WHERE e."courseId" = ${courseId}::uuid AND e.status <> 'canceled'`;
  }

  /** Alunos com matrícula activa (para notificações em massa). */
  async enrolledUserIds(courseId: string): Promise<string[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { courseId, status: { not: EnrollmentStatus.canceled } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private percent(done: number, total: number) {
    return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }

  private async requireEnrollment(userId: string, courseId: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!e || e.status === EnrollmentStatus.canceled) throw new ForbiddenException('Você não está matriculado neste curso');
    return e;
  }
}
