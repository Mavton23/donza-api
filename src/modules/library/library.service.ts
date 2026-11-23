import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { LessonType, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf, PaginationQueryDto } from '@/common/utils/pagination';
import { displayName, getManageableCourse } from '../courses/course-access';
import { BatchLessonsDto, CreateLessonDto, UpdateLessonDto } from '../courses/dto/content.dto';
import { EnrollmentsService } from '../courses/enrollments.service';
import { lessonCreateData, MEDIA_LESSONS } from '../courses/lesson-data';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AttachModuleDto, CreateLibraryModuleDto, LibraryLessonsQueryDto, LibrarySignDto, UpdateLibraryModuleDto } from './dto/library.dto';

/** Pasta do Cloudinary onde cada autor guarda as aulas da sua biblioteca. */
export const libraryFolder = (userId: string) => `library/${userId}/lessons`;
const KINDS = {
  video: { resourceType: 'video', allowedFormats: ['mp4', 'mov', 'webm', 'mkv'] },
  audio: { resourceType: 'video', allowedFormats: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] },
  pdf: { resourceType: 'raw', allowedFormats: undefined },
} as const;
const PERSON = { userId: true, username: true, fullName: true, institutionName: true, avatarUrl: true, role: true } as const;
const PREVIEW = { lessonId: true, title: true, lessonType: true, level: true, duration: true, isFree: true, price: true, createdAt: true } as const;

/**
 * Biblioteca de aulas independentes: módulos sem curso (`courseId` nulo) que pertencem ao seu autor.
 * Podem ser acrescentados a um curso (attach) e retirados (detach) enquanto ninguém tiver progresso neles.
 */
@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly enrollments: EnrollmentsService) {}

  private isAdmin(u: AuthUser) { return u.role === UserRole.admin; }

  sign(user: AuthUser, dto: LibrarySignDto) {
    const k = KINDS[dto.kind];
    return { success: true, data: this.storage.signUpload({ folder: libraryFolder(user.userId), resourceType: k.resourceType, allowedFormats: k.allowedFormats ? [...k.allowedFormats] : undefined }) };
  }

  /** Módulo solto do utilizador (ou de qualquer um, para o admin). */
  private async ownModule(user: AuthUser, moduleId: string) {
    const m = await this.prisma.module.findFirst({ where: { moduleId, courseId: null, ...(!this.isAdmin(user) && { creatorId: user.userId }) } });
    if (!m) throw new NotFoundException({ message: 'Módulo da biblioteca não encontrado', code: 'MODULE_NOT_FOUND' });
    return m;
  }

  private assertMedia(ownerId: string, type: LessonType, mediaUrl: string | undefined, publishing: boolean) {
    if (mediaUrl && !this.storage.isOwnAssetUnder(mediaUrl, libraryFolder(ownerId))) throw new BadRequestException('mediaUrl inválido: use o upload assinado da biblioteca');
    if (publishing && MEDIA_LESSONS.includes(type) && !mediaUrl) throw new BadRequestException(`Uma aula de ${type} só pode ser publicada com ficheiro (mediaUrl)`);
  }

  // ── Módulos ──────────────────────────────────────────────────────────────

  async createModule(user: AuthUser, dto: CreateLibraryModuleDto) {
    const module = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'lib:' + user.userId}))`;
      const max = await tx.module.aggregate({ where: { creatorId: user.userId, courseId: null }, _max: { order: true } });
      return tx.module.create({ data: { creatorId: user.userId, title: dto.title, description: dto.description, isPublished: dto.isPublished ?? false, order: (max._max.order ?? 0) + 1 } });
    });
    return { success: true, data: module };
  }

  async listModules(user: AuthUser, q: PaginationQueryDto) {
    const where: Prisma.ModuleWhereInput = { courseId: null, ...(!this.isAdmin(user) && { creatorId: user.userId }) };
    const [rows, total] = await Promise.all([
      this.prisma.module.findMany({ where, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], skip: skipOf(q), take: q.limit, include: { _count: { select: { lessons: true } } } }),
      this.prisma.module.count({ where }),
    ]);
    return paginated(rows.map(({ _count, ...m }) => ({ ...m, lessonsCount: _count.lessons })), total, q);
  }

  async getModule(user: AuthUser, moduleId: string) {
    await this.ownModule(user, moduleId);
    const m = await this.prisma.module.findUniqueOrThrow({ where: { moduleId }, include: { lessons: { orderBy: { order: 'asc' } } } });
    return { success: true, data: { ...m, lessons: m.lessons.map((l) => ({ ...l, price: Number(l.price) })) } };
  }

  async updateModule(user: AuthUser, moduleId: string, dto: UpdateLibraryModuleDto) {
    await this.ownModule(user, moduleId);
    const m = await this.prisma.module.update({ where: { moduleId }, data: dto });
    return { success: true, data: m };
  }

  async deleteModule(user: AuthUser, moduleId: string) {
    await this.ownModule(user, moduleId);
    if (await this.prisma.userLesson.count({ where: { lesson: { moduleId } } })) {
      throw new ConflictException({ message: 'Há alunos com progresso nestas aulas: despublique o módulo em vez de o apagar', code: 'HAS_PROGRESS' });
    }
    await this.prisma.module.delete({ where: { moduleId } });
    return { success: true, message: 'Módulo apagado' };
  }

  // ── Aulas ────────────────────────────────────────────────────────────────

  async createLesson(user: AuthUser, moduleId: string, dto: CreateLessonDto) {
    const m = await this.ownModule(user, moduleId);
    this.assertMedia(m.creatorId, dto.lessonType ?? LessonType.video, dto.mediaUrl, dto.isPublished ?? false);
    const lesson = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM modules WHERE "moduleId" = ${moduleId}::uuid FOR UPDATE`;
      const max = await tx.lesson.aggregate({ where: { moduleId }, _max: { order: true } });
      const order = dto.order ?? (max._max.order ?? 0) + 1;
      if (dto.order) await tx.lesson.updateMany({ where: { moduleId, order: { gte: dto.order } }, data: { order: { increment: 1 } } });
      return tx.lesson.create({ data: lessonCreateData(dto, moduleId, user.userId, order) });
    });
    return { success: true, data: lesson };
  }

  async createLessonsBatch(user: AuthUser, moduleId: string, dto: BatchLessonsDto) {
    const m = await this.ownModule(user, moduleId);
    dto.lessons.forEach((l, i) => {
      try { this.assertMedia(m.creatorId, l.lessonType ?? LessonType.video, l.mediaUrl, l.isPublished ?? false); }
      catch (e) { throw new BadRequestException(`Aula ${i + 1}: ${(e as Error).message}`); }
    });
    const lessons = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM modules WHERE "moduleId" = ${moduleId}::uuid FOR UPDATE`;
      const max = await tx.lesson.aggregate({ where: { moduleId }, _max: { order: true } });
      const base = (max._max.order ?? 0) + 1;
      return tx.lesson.createManyAndReturn({ data: dto.lessons.map((l, i) => lessonCreateData(l, moduleId, user.userId, base + i)) });
    });
    return { success: true, data: lessons.sort((a, b) => a.order - b.order) };
  }

  async updateLesson(user: AuthUser, moduleId: string, lessonId: string, dto: UpdateLessonDto) {
    const m = await this.ownModule(user, moduleId);
    const cur = await this.prisma.lesson.findFirst({ where: { lessonId, moduleId } });
    if (!cur) throw new NotFoundException({ message: 'Aula não encontrada neste módulo', code: 'LESSON_NOT_FOUND' });
    const type = dto.lessonType ?? cur.lessonType;
    const url = dto.mediaUrl ?? cur.mediaUrl ?? undefined;
    this.assertMedia(m.creatorId, type, dto.mediaUrl, false);
    this.assertMedia(m.creatorId, type, url, dto.isPublished ?? cur.isPublished);
    const isFree = dto.isFree ?? cur.isFree;
    const lesson = await this.prisma.lesson.update({ where: { lessonId }, data: { ...dto, ...(isFree && { price: 0 }) } });
    return { success: true, data: lesson };
  }

  async deleteLesson(user: AuthUser, moduleId: string, lessonId: string) {
    await this.ownModule(user, moduleId);
    const { count } = await this.prisma.lesson.deleteMany({ where: { lessonId, moduleId } });
    if (!count) throw new NotFoundException({ message: 'Aula não encontrada neste módulo', code: 'LESSON_NOT_FOUND' });
    return { success: true, message: 'Aula apagada' };
  }

  async reorderLessons(user: AuthUser, moduleId: string, ids: string[]) {
    await this.ownModule(user, moduleId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM modules WHERE "moduleId" = ${moduleId}::uuid FOR UPDATE`;
      const existing = (await tx.lesson.findMany({ where: { moduleId }, select: { lessonId: true } })).map((l) => l.lessonId);
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((id) => !existing.includes(id))) {
        throw new BadRequestException('A lista de ids deve conter exactamente todas as aulas do módulo');
      }
      await Promise.all(ids.map((lessonId, i) => tx.lesson.update({ where: { lessonId }, data: { order: i + 1 } })));
    });
    return { success: true, message: 'Aulas reordenadas com sucesso' };
  }

  // ── Ligar a cursos ───────────────────────────────────────────────────────

  async attach(user: AuthUser, moduleId: string, dto: AttachModuleDto) {
    const m = await this.ownModule(user, moduleId);
    await getManageableCourse(this.prisma, dto.courseId, user);
    const ok = await this.prisma.$transaction(async (tx) => {
      const max = await tx.module.aggregate({ where: { courseId: dto.courseId }, _max: { order: true } });
      const { count } = await tx.module.updateMany({ where: { moduleId, courseId: null }, data: { courseId: dto.courseId, order: (max._max.order ?? 0) + 1 } });
      return count > 0;
    });
    if (!ok) throw new ConflictException({ message: 'O módulo já foi ligado a um curso', code: 'ALREADY_ATTACHED' });
    if (m.isPublished) await this.enrollments.resyncCourse(dto.courseId);
    return { success: true, message: 'Módulo adicionado ao curso' };
  }

  async detach(user: AuthUser, moduleId: string) {
    const m = await this.prisma.module.findUnique({ where: { moduleId }, include: { lessons: { select: { lessonId: true } } } });
    if (!m || !m.courseId) throw new NotFoundException({ message: 'Módulo não encontrado ou sem curso', code: 'MODULE_NOT_FOUND' });
    if (!this.isAdmin(user) && m.creatorId !== user.userId) throw new ForbiddenException('Só o autor do módulo o pode retirar do curso');
    await getManageableCourse(this.prisma, m.courseId, user);
    const [progress, assignments] = await Promise.all([
      this.prisma.userLesson.count({ where: { lesson: { moduleId } } }),
      this.prisma.assignment.count({ where: { OR: [{ moduleId }, { lessonId: { in: m.lessons.map((l) => l.lessonId) } }] } }),
    ]);
    if (progress || assignments) throw new ConflictException({ message: 'O módulo tem progresso de alunos ou trabalhos associados', code: 'HAS_PROGRESS' });
    const courseId = m.courseId;
    const { count } = await this.prisma.module.updateMany({ where: { moduleId, courseId }, data: { courseId: null } });
    if (!count) throw new ConflictException({ message: 'O módulo já foi retirado', code: 'ALREADY_DETACHED' });
    await this.enrollments.resyncCourse(courseId);
    return { success: true, message: 'Módulo retirado do curso' };
  }

  // ── Catálogo público e progresso ─────────────────────────────────────────

  async catalog(q: LibraryLessonsQueryDto) {
    const l = q.q ? { contains: escapeLike(q.q), mode: 'insensitive' as const } : undefined;
    const where: Prisma.LessonWhereInput = {
      isPublished: true, module: { courseId: null, isPublished: true, creator: { status: 'approved', ...(q.instructorId && { userId: q.instructorId }) } },
      ...(q.free !== undefined && { isFree: q.free }), ...(l && { title: l }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.lesson.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: { ...PREVIEW, module: { select: { moduleId: true, title: true, creator: { select: PERSON } } } } }),
      this.prisma.lesson.count({ where }),
    ]);
    return paginated(rows.map(({ module, ...r }) => ({ ...r, price: Number(r.price), module: { moduleId: module.moduleId, title: module.title }, author: { ...module.creator, name: displayName(module.creator) } })), total, q);
  }

  /** Aula solta que o utilizador pode ver: publicada, ou sua (autor/admin). */
  private async readable(viewer: AuthUser | undefined, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { lessonId, module: { courseId: null } }, include: { module: { select: { moduleId: true, title: true, isPublished: true, creatorId: true } } } });
    const privileged = !!viewer && (viewer.role === UserRole.admin || lesson?.module.creatorId === viewer.userId);
    if (!lesson || (!privileged && !(lesson.isPublished && lesson.module.isPublished))) throw new NotFoundException({ message: 'Aula não encontrada', code: 'LESSON_NOT_FOUND' });
    return { lesson, privileged };
  }

  async lesson(viewer: AuthUser | undefined, lessonId: string) {
    const { lesson, privileged } = await this.readable(viewer, lessonId);
    if (!lesson.isFree && !privileged) {
      // Não há compra de aulas soltas: o conteúdo pago só se vê dentro de um curso.
      throw new HttpException({ message: 'Aula paga: disponível apenas dentro de um curso', code: 'PAYMENT_REQUIRED', preview: { lessonId, title: lesson.title, price: Number(lesson.price) } }, HttpStatus.PAYMENT_REQUIRED);
    }
    const progress = viewer ? await this.prisma.userLesson.findUnique({ where: { userId_lessonId: { userId: viewer.userId, lessonId } }, select: { completed: true } }) : null;
    return { success: true, data: { ...lesson, price: Number(lesson.price), completed: progress?.completed ?? false } };
  }

  async setCompleted(user: AuthUser, lessonId: string, completed: boolean) {
    const { lesson, privileged } = await this.readable(user, lessonId);
    if (!lesson.isFree && !privileged) throw new HttpException({ message: 'Aula paga', code: 'PAYMENT_REQUIRED' }, HttpStatus.PAYMENT_REQUIRED);
    await this.prisma.userLesson.upsert({
      where: { userId_lessonId: { userId: user.userId, lessonId } },
      create: { userId: user.userId, lessonId, completed, completedAt: completed ? new Date() : null },
      update: { completed, completedAt: completed ? new Date() : null },
    });
    return { success: true, data: { lessonId, completed } };
  }
}
