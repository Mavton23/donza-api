import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  InstructorLinkStatus,
  NotificationType,
  Prisma,
  PublicationStatus,
  UserRole,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { canManage, courseWhere, displayName, getManageableCourse, slugify } from './course-access';
import {
  AdminListCoursesQueryDto,
  CreateCourseDto,
  FeaturedQueryDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
  UserCoursesQueryDto,
} from './dto/course.dto';

const PEOPLE_SELECT = {
  userId: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  institutionName: true,
} as const;

const ACTIVE_ENROLLMENTS = { where: { status: { not: EnrollmentStatus.canceled } } } as const;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────────── Listagens ─────────────────────────────

  private orderBy(sort: ListCoursesQueryDto['sort']): Prisma.CourseOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'popular':
        return [{ enrollments: { _count: 'desc' } }, { createdAt: 'desc' }];
      case 'rating':
        return [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }];
      case 'title':
        return [{ title: 'asc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private searchFilter(search?: string): Prisma.CourseWhereInput {
    if (!search) return {};
    const contains = { contains: search, mode: 'insensitive' as const };
    return {
      OR: [
        { title: contains },
        { shortDescription: contains },
        { description: contains },
        { instructor: { OR: [{ username: contains }, { fullName: contains }] } },
      ],
    };
  }

  /** Substitui o `_count` do Prisma por `enrollmentsCount`. */
  private flatten<T extends { _count?: { enrollments: number } }>(c: T) {
    const { _count, ...rest } = c;
    return { ...rest, enrollmentsCount: _count?.enrollments ?? 0 };
  }

  async listPublic(q: ListCoursesQueryDto) {
    const where: Prisma.CourseWhereInput = {
      status: PublicationStatus.published,
      isPublic: true,
      ...(q.level && { level: q.level }),
      ...(q.language && { language: q.language }),
      ...(q.category && { category: q.category }),
      ...this.searchFilter(q.search),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: this.orderBy(q.sort),
        skip: skipOf(q),
        take: q.limit,
        include: {
          instructor: { select: PEOPLE_SELECT },
          _count: { select: { enrollments: ACTIVE_ENROLLMENTS } },
        },
      }),
    ]);
    return paginated(rows.map((c) => this.flatten(c)), total, q);
  }

  async listAdmin(q: AdminListCoursesQueryDto) {
    const where: Prisma.CourseWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.level && { level: q.level }),
      ...(q.language && { language: q.language }),
      ...(q.category && { category: q.category }),
      ...this.searchFilter(q.search),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: this.orderBy(q.sort),
        skip: skipOf(q),
        take: q.limit,
        include: {
          instructor: { select: { ...PEOPLE_SELECT, email: true } },
          _count: { select: { enrollments: ACTIVE_ENROLLMENTS } },
        },
      }),
    ]);
    return paginated(rows.map((c) => this.flatten(c)), total, q);
  }

  async featured(q: FeaturedQueryDto) {
    const rows = await this.prisma.course.findMany({
      where: { status: PublicationStatus.published, isPublic: true, ratingAverage: { gte: q.minRating } },
      orderBy: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }],
      take: q.limit,
      include: { instructor: { select: PEOPLE_SELECT }, _count: { select: { enrollments: ACTIVE_ENROLLMENTS } } },
    });
    return { success: true, data: rows.map((c) => this.flatten(c)), meta: { limit: q.limit, minRating: q.minRating } };
  }

  /** Cursos de um utilizador (como instrutor ou organizador). Só o próprio ou admin. */
  async listByUser(viewer: AuthUser, userId: string, q: UserCoursesQueryDto) {
    this.assertSelfOrAdmin(viewer, userId);
    const courses = await this.prisma.course.findMany({
      where: { OR: [{ instructorId: userId }, { organizerId: userId }], ...(q.status && { status: q.status }) },
      orderBy: { createdAt: 'desc' },
      include: {
        instructor: { select: { ...PEOPLE_SELECT, bio: true, expertise: true } },
        organizer: { select: { ...PEOPLE_SELECT, institutionType: true } },
        modules: { select: { lessons: { select: { lessonId: true } } } },
        _count: { select: { enrollments: ACTIVE_ENROLLMENTS } },
      },
    });
    const data = courses.map((c) => {
      const { modules, ...rest } = c;
      const creator = c.organizer ?? c.instructor;
      return {
        ...this.flatten(rest),
        creator: { ...creator, displayName: displayName(creator) },
        metrics: {
          enrollments: c._count.enrollments,
          lessonsCount: modules.reduce((n, m) => n + m.lessons.length, 0),
          modulesCount: modules.length,
        },
      };
    });
    return { success: true, data: { courses: data } };
  }

  async countsByStatus(viewer: AuthUser, userId: string) {
    this.assertSelfOrAdmin(viewer, userId);
    const groups = await this.prisma.course.groupBy({
      by: ['status'],
      where: { OR: [{ instructorId: userId }, { organizerId: userId }] },
      _count: { _all: true },
    });
    const data: Record<PublicationStatus, number> = { draft: 0, published: 0, archived: 0 };
    for (const g of groups) data[g.status] = g._count._all;
    return { success: true, data };
  }

  // ───────────────────────────── Detalhe ─────────────────────────────

  /**
   * Detalhe por id ou slug. O que se vê depende de quem pede:
   *  - gestor (instrutor/organizador/admin): tudo, incluindo rascunhos;
   *  - aluno matriculado: curso publicado com todo o conteúdo publicado;
   *  - restantes: só cursos publicados e públicos; conteúdo das aulas só nas aulas gratuitas.
   * (O Express devolvia a lista de userIds de todos os alunos e o conteúdo de todas as aulas.)
   */
  async getDetail(idOrSlug: string, viewer?: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: courseWhere(idOrSlug),
      include: {
        instructor: { select: { ...PEOPLE_SELECT, bio: true } },
        organizer: { select: { ...PEOPLE_SELECT, institutionType: true } },
        modules: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
        _count: { select: { enrollments: ACTIVE_ENROLLMENTS } },
      },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');

    const manage = canManage(viewer, course);
    const enrollment = viewer
      ? await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: viewer.userId, courseId: course.courseId } },
          select: { enrollmentId: true, status: true, progress: true, enrolledAt: true, lastAccessed: true, favorite: true },
        })
      : null;
    const enrolled = !!enrollment && enrollment.status !== EnrollmentStatus.canceled;

    if (!manage) {
      const visible = course.status === PublicationStatus.published && (course.isPublic || enrolled);
      if (!visible) throw new NotFoundException('Curso não encontrado');
    }

    const fullAccess = manage || enrolled;
    const modules = course.modules
      .filter((m) => manage || m.isPublished)
      .map((m) => ({
        ...m,
        lessons: m.lessons
          .filter((l) => manage || l.isPublished)
          .map((l) => {
            if (fullAccess || l.isFree) return l;
            // Pré-visualização: mantém só o que o catálogo precisa de mostrar.
            const { content, mediaUrl, externalResources, ...preview } = l;
            return { ...preview, locked: true };
          }),
      }));

    const { _count, modules: _omit, ...rest } = course;
    const creator = course.organizer ?? course.instructor;
    return {
      success: true,
      data: {
        ...rest,
        modules,
        creator: { ...creator, displayName: displayName(creator) },
        metrics: {
          enrollments: _count.enrollments,
          lessonsCount: modules.reduce((n, m) => n + m.lessons.length, 0),
          modulesCount: modules.length,
        },
        viewer: {
          canManage: manage,
          isEnrolled: enrolled,
          enrollment: enrolled ? enrollment : null,
        },
      },
    };
  }

  // ───────────────────────────── Criar / actualizar / apagar ─────────────────────────────

  private async resolveOwnership(user: AuthUser, dto: CreateCourseDto) {
    if (user.role === UserRole.instructor) {
      return { instructorId: user.userId, organizerId: null as string | null };
    }

    if (user.role === UserRole.institution) {
      if (!dto.instructorId || dto.instructorId === user.userId) {
        // Curso dado pela própria instituição (como no Express: instructorId nulo + organizerId = instituição).
        const inst = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { institutionName: true } });
        if (!inst?.institutionName) throw new ForbiddenException('Seu perfil de instituição precisa ser completado');
        return { instructorId: user.userId, organizerId: user.userId };
      }
      const link = await this.prisma.institutionInstructor.findUnique({
        where: { institutionId_instructorId: { institutionId: user.userId, instructorId: dto.instructorId } },
        select: { status: true },
      });
      if (link?.status !== InstructorLinkStatus.accepted) {
        throw new BadRequestException('O instrutor indicado não está ligado à sua instituição');
      }
      return { instructorId: dto.instructorId, organizerId: user.userId };
    }

    // admin
    if (!dto.instructorId) throw new BadRequestException('instructorId é obrigatório');
    const instructor = await this.prisma.user.findUnique({ where: { userId: dto.instructorId }, select: { role: true } });
    if (!instructor || (instructor.role !== UserRole.instructor && instructor.role !== UserRole.institution)) {
      throw new BadRequestException('instructorId deve ser um instrutor ou instituição');
    }
    if (dto.organizerId) {
      const org = await this.prisma.user.findUnique({ where: { userId: dto.organizerId }, select: { role: true } });
      if (org?.role !== UserRole.institution) throw new BadRequestException('organizerId deve ser uma instituição');
    }
    return { instructorId: dto.instructorId, organizerId: dto.organizerId ?? null };
  }

  async create(user: AuthUser, dto: CreateCourseDto, cover: Express.Multer.File | undefined) {
    if (!cover) throw new BadRequestException('A imagem de capa é obrigatória');
    const owners = await this.resolveOwnership(user, dto);

    // Upload antes da BD; se a BD falhar, a capa é removida (não ficam órfãos no Cloudinary).
    const uploaded = await this.storage.upload(cover, { folder: `course-covers/${user.userId}`, resourceType: 'image' });

    try {
      const course = await this.createWithUniqueSlug({
        ...owners,
        title: dto.title,
        shortDescription: dto.shortDescription,
        description: dto.description,
        category: dto.category ?? 'technology',
        level: dto.level,
        language: dto.language,
        duration: dto.duration ?? 1,
        price: dto.price ?? 0,
        currency: dto.currency,
        isPublic: dto.isPublic ?? true,
        requirements: dto.requirements ?? [],
        learningOutcomes: dto.learningOutcomes ?? [],
        coverImageUrl: uploaded.url,
        status: dto.isPublished ? PublicationStatus.published : PublicationStatus.draft,
      });

      await this.notifications.notify(user.userId, NotificationType.COURSE_CREATED, {
        title: 'Curso criado',
        message: `O curso "${course.title}" foi criado.`,
        relatedEntityId: course.courseId,
        metadata: { courseId: course.courseId, slug: course.slug },
      });
      if (course.status === PublicationStatus.published) await this.notifyPublished(course);

      return {
        success: true,
        data: {
          courseId: course.courseId,
          slug: course.slug,
          title: course.title,
          status: course.status,
          coverImageUrl: course.coverImageUrl,
          createdAt: course.createdAt,
        },
      };
    } catch (err) {
      await this.storage.remove(uploaded.key, { resourceType: 'image' });
      throw err;
    }
  }

  private async createWithUniqueSlug(data: Omit<Prisma.CourseUncheckedCreateInput, 'slug'>) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = `${slugify(data.title)}-${randomBytes(3).toString('hex')}`;
      try {
        return await this.prisma.course.create({ data: { ...data, slug } });
      } catch (err) {
        const isSlugClash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String((err.meta as { target?: unknown })?.target).includes('slug');
        if (!isSlugClash) throw err;
      }
    }
    throw new ConflictException('Não foi possível gerar um endereço único para o curso. Tente novamente.');
  }

  async update(user: AuthUser, courseId: string, dto: UpdateCourseDto, cover: Express.Multer.File | undefined) {
    const current = await getManageableCourse(this.prisma, courseId, user);

    if (dto.instructorId && dto.instructorId !== current.instructorId && user.role !== UserRole.admin) {
      throw new ForbiddenException('Apenas administradores podem transferir cursos');
    }
    if (dto.instructorId && dto.instructorId !== current.instructorId) {
      const target = await this.prisma.user.findUnique({ where: { userId: dto.instructorId }, select: { role: true } });
      if (!target || (target.role !== UserRole.instructor && target.role !== UserRole.institution)) {
        throw new BadRequestException('instructorId deve ser um instrutor ou instituição');
      }
    }

    let newCover: { key: string; url: string } | undefined;
    if (cover) {
      newCover = await this.storage.upload(cover, { folder: `course-covers/${current.instructorId}`, resourceType: 'image' });
    }

    try {
      const { removeCover, ...fields } = dto;
      const updated = await this.prisma.course.update({
        where: { courseId },
        data: {
          ...fields,
          ...(newCover && { coverImageUrl: newCover.url }),
          ...(removeCover && !newCover && { coverImageUrl: null }),
        },
      });

      if (newCover || removeCover) await this.storage.removeByUrl(current.coverImageUrl);

      // Só notifica na transição para publicado (o Express notificava em TODAS as actualizações).
      if (current.status !== PublicationStatus.published && updated.status === PublicationStatus.published) {
        await this.notifyPublished(updated);
      }
      return { success: true, data: updated };
    } catch (err) {
      if (newCover) await this.storage.remove(newCover.key, { resourceType: 'image' });
      throw err;
    }
  }

  async remove(user: AuthUser, courseId: string) {
    const course = await getManageableCourse(this.prisma, courseId, user);

    const students = await this.prisma.enrollment.findMany({
      where: { courseId, status: { not: EnrollmentStatus.canceled } },
      select: { userId: true },
    });
    if (students.length > 0 && user.role !== UserRole.admin) {
      throw new ConflictException(
        'Este curso tem alunos matriculados. Arquive-o em vez de o eliminar (ou peça a um administrador).',
      );
    }

    if (await this.prisma.certificate.count({ where: { courseId } })) {
      throw new ConflictException('Este curso já emitiu certificados e não pode ser eliminado. Arquive-o.');
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { module: { courseId }, mediaUrl: { not: null } },
      select: { mediaUrl: true },
    });

    await this.prisma.course.delete({ where: { courseId } });

    // Limpeza best-effort dos ficheiros (a BD já está consistente).
    await Promise.all([course.coverImageUrl, ...lessons.map((l) => l.mediaUrl)].map((u) => this.storage.removeByUrl(u)));

    const others = [course.instructorId, course.organizerId, ...students.map((s) => s.userId)].filter(
      (id): id is string => !!id && id !== user.userId,
    );
    await this.notifications.notifyMany(others, NotificationType.COURSE_DELETED, {
      title: 'Curso eliminado',
      message: `O curso "${course.title}" foi eliminado.`,
      metadata: { courseId, deletedBy: user.userId },
    });

    return { success: true, message: 'Curso excluído com sucesso' };
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private assertSelfOrAdmin(viewer: AuthUser, userId: string) {
    if (viewer.userId !== userId && viewer.role !== UserRole.admin) {
      throw new ForbiddenException('Você não tem permissão para aceder a estes cursos');
    }
  }

  private notifyPublished(course: { courseId: string; title: string; slug: string; instructorId: string; organizerId: string | null }) {
    return this.notifications.notifyMany(
      [course.instructorId, course.organizerId].filter((x): x is string => !!x),
      NotificationType.COURSE_PUBLISHED,
      {
        title: 'Curso publicado',
        message: `O curso "${course.title}" foi publicado com sucesso!`,
        relatedEntityId: course.courseId,
        metadata: { courseId: course.courseId, slug: course.slug },
      },
    );
  }
}
