import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LessonType, NotificationType, Prisma, PublicationStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { getManageableCourse } from './course-access';
import { BatchLessonsDto, CreateLessonDto, CreateModuleDto, SignUploadDto, UpdateLessonDto, UpdateModuleDto } from './dto/content.dto';
import { EnrollmentsService } from './enrollments.service';
import { lessonCreateData } from './lesson-data';

const MEDIA_LESSONS: LessonType[] = [LessonType.video, LessonType.audio, LessonType.pdf];

const UPLOAD_KINDS = {
  video: { resourceType: 'video', allowedFormats: ['mp4', 'mov', 'webm', 'mkv'] },
  audio: { resourceType: 'video', allowedFormats: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }, // o Cloudinary trata áudio como "video"
  pdf: { resourceType: 'raw', allowedFormats: undefined },
} as const;

/** Pasta onde o Cloudinary recebe os ficheiros das aulas de um curso. */
export const lessonFolder = (courseId: string) => `courses/${courseId}/lessons`;

@Injectable()
export class CourseContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  // ───────────────────────────── Upload directo ─────────────────────────────

  /**
   * O browser envia o vídeo directamente ao Cloudinary com esta assinatura (a API não
   * faz de intermediária para ficheiros de centenas de MB). A pasta vai assinada, por isso
   * o cliente só consegue escrever na pasta deste curso.
   */
  async signUpload(user: AuthUser, courseId: string, dto: SignUploadDto) {
    await getManageableCourse(this.prisma, courseId, user);
    const kind = UPLOAD_KINDS[dto.kind];
    return {
      success: true,
      data: this.storage.signUpload({
        folder: lessonFolder(courseId),
        resourceType: kind.resourceType,
        allowedFormats: kind.allowedFormats ? [...kind.allowedFormats] : undefined,
      }),
    };
  }

  // ───────────────────────────── Módulos ─────────────────────────────

  async createModule(user: AuthUser, courseId: string, dto: CreateModuleDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);

    const module = await this.prisma.$transaction(async (tx) => {
      const order = dto.order ?? (await this.nextOrder(tx, 'module', { courseId }));
      if (dto.order) {
        // Abre espaço na posição pedida.
        await tx.module.updateMany({ where: { courseId, order: { gte: dto.order } }, data: { order: { increment: 1 } } });
      }
      return tx.module.create({
        data: {
          courseId,
          creatorId: user.userId,
          title: dto.title,
          description: dto.description,
          order,
          isPublished: dto.isPublished ?? false,
        },
      });
    });

    if (module.isPublished) {
      await this.enrollments.resyncCourse(courseId);
      await this.notifyStudents(course, `Novo módulo disponível: "${module.title}"`, { moduleId: module.moduleId }, NotificationType.MODULE_CREATED);
    }
    return { success: true, data: module };
  }

  async updateModule(user: AuthUser, courseId: string, moduleId: string, dto: UpdateModuleDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    const current = await this.findModule(courseId, moduleId);
    const module = await this.prisma.module.update({ where: { moduleId }, data: dto });

    if (dto.isPublished !== undefined && dto.isPublished !== current.isPublished) {
      await this.enrollments.resyncCourse(courseId);
      if (dto.isPublished) {
        await this.notifyStudents(course, `Novo módulo disponível: "${module.title}"`, { moduleId }, NotificationType.MODULE_CREATED);
      }
    }
    return { success: true, data: module };
  }

  async deleteModule(user: AuthUser, courseId: string, moduleId: string) {
    await getManageableCourse(this.prisma, courseId, user);
    await this.findModule(courseId, moduleId);
    const lessons = await this.prisma.lesson.findMany({ where: { moduleId, mediaUrl: { not: null } }, select: { mediaUrl: true } });

    await this.prisma.module.delete({ where: { moduleId } }); // cascata: aulas e progresso
    await Promise.all(lessons.map((l) => this.storage.removeByUrl(l.mediaUrl)));
    await this.enrollments.resyncCourse(courseId);
    return { success: true, message: 'Módulo removido com sucesso' };
  }

  async reorderModules(user: AuthUser, courseId: string, ids: string[]) {
    await getManageableCourse(this.prisma, courseId, user);
    const existing = await this.prisma.module.findMany({ where: { courseId }, select: { moduleId: true } });
    this.assertSameSet(existing.map((m) => m.moduleId), ids);
    await this.prisma.$transaction(
      ids.map((moduleId, i) => this.prisma.module.update({ where: { moduleId }, data: { order: i + 1 } })),
    );
    return { success: true, message: 'Módulos reordenados com sucesso' };
  }

  // ───────────────────────────── Aulas ─────────────────────────────

  async createLesson(user: AuthUser, courseId: string, moduleId: string, dto: CreateLessonDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    const module = await this.findModule(courseId, moduleId);

    const lessonType = dto.lessonType ?? LessonType.video;
    this.assertMedia(courseId, lessonType, dto.mediaUrl, dto.isPublished ?? false);
    const isFree = dto.isFree ?? false;

    const lesson = await this.prisma.$transaction(async (tx) => {
      const order = dto.order ?? (await this.nextOrder(tx, 'lesson', { moduleId }));
      if (dto.order) {
        await tx.lesson.updateMany({ where: { moduleId, order: { gte: dto.order } }, data: { order: { increment: 1 } } });
      }
      return tx.lesson.create({
        data: {
          moduleId,
          creatorId: user.userId,
          title: dto.title,
          content: dto.content,
          lessonType,
          level: dto.level,
          mediaUrl: dto.mediaUrl,
          externalResources: dto.externalResources ?? [],
          duration: dto.duration,
          order,
          isFree,
          price: isFree ? 0 : (dto.price ?? 0),
          isPublished: dto.isPublished ?? false,
        },
      });
    });

    if (lesson.isPublished && module.isPublished) {
      await this.enrollments.resyncCourse(courseId);
      await this.notifyStudents(course, `Nova aula disponível: "${lesson.title}"`, { lessonId: lesson.lessonId, moduleId }, NotificationType.LESSON_CREATED);
    }
    return { success: true, data: lesson };
  }

  /** Cria várias aulas de uma vez, tudo ou nada, no fim do módulo e pela ordem da lista. */
  async createLessonsBatch(user: AuthUser, courseId: string, moduleId: string, dto: BatchLessonsDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    const module = await this.findModule(courseId, moduleId);
    dto.lessons.forEach((l, i) => {
      try { this.assertMedia(courseId, l.lessonType ?? LessonType.video, l.mediaUrl, l.isPublished ?? false); }
      catch (e) { throw new BadRequestException(`Aula ${i + 1}: ${(e as Error).message}`); }
    });
    const lessons = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM modules WHERE "moduleId" = ${moduleId}::uuid FOR UPDATE`; // ordens sem colisões entre lotes simultâneos
      const base = await this.nextOrder(tx, 'lesson', { moduleId });
      return tx.lesson.createManyAndReturn({ data: dto.lessons.map((l, i) => lessonCreateData(l, moduleId, user.userId, base + i)) });
    });
    const published = lessons.filter((l) => l.isPublished);
    if (published.length && module.isPublished) {
      await this.enrollments.resyncCourse(courseId);
      await this.notifyStudents(course, published.length === 1 ? `Nova aula disponível: "${published[0].title}"` : `${published.length} novas aulas disponíveis`, { moduleId }, NotificationType.LESSON_CREATED);
    }
    return { success: true, data: lessons.sort((a, b) => a.order - b.order) };
  }

  async updateLesson(user: AuthUser, courseId: string, moduleId: string, lessonId: string, dto: UpdateLessonDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    const module = await this.findModule(courseId, moduleId);
    const current = await this.findLesson(moduleId, lessonId);

    const type = dto.lessonType ?? current.lessonType;
    const mediaUrl = dto.mediaUrl !== undefined ? dto.mediaUrl : current.mediaUrl;
    const publish = dto.isPublished ?? current.isPublished;
    this.assertMedia(courseId, type, mediaUrl ?? undefined, publish);

    const isFree = dto.isFree ?? current.isFree;
    const lesson = await this.prisma.lesson.update({
      where: { lessonId },
      data: { ...dto, ...(isFree && { price: 0 }) },
    });

    // O ficheiro antigo só é apagado depois de a BD apontar para o novo.
    if (dto.mediaUrl !== undefined && current.mediaUrl && current.mediaUrl !== dto.mediaUrl) {
      await this.storage.removeByUrl(current.mediaUrl);
    }

    if (dto.isPublished !== undefined && dto.isPublished !== current.isPublished) {
      await this.enrollments.resyncCourse(courseId);
      // Só avisa na publicação (o Express avisava a cada edição).
      if (dto.isPublished && module.isPublished) {
        await this.notifyStudents(course, `Nova aula disponível: "${lesson.title}"`, { lessonId, moduleId }, NotificationType.LESSON_CREATED);
      }
    }
    return { success: true, data: lesson };
  }

  async deleteLesson(user: AuthUser, courseId: string, moduleId: string, lessonId: string) {
    await getManageableCourse(this.prisma, courseId, user);
    await this.findModule(courseId, moduleId);
    const lesson = await this.findLesson(moduleId, lessonId);

    await this.prisma.lesson.delete({ where: { lessonId } });
    await this.storage.removeByUrl(lesson.mediaUrl);
    await this.enrollments.resyncCourse(courseId);
    return { success: true, message: 'Aula removida com sucesso' };
  }

  async reorderLessons(user: AuthUser, courseId: string, moduleId: string, ids: string[]) {
    await getManageableCourse(this.prisma, courseId, user);
    await this.findModule(courseId, moduleId);
    const existing = await this.prisma.lesson.findMany({ where: { moduleId }, select: { lessonId: true } });
    this.assertSameSet(existing.map((l) => l.lessonId), ids);
    await this.prisma.$transaction(
      ids.map((lessonId, i) => this.prisma.lesson.update({ where: { lessonId }, data: { order: i + 1 } })),
    );
    return { success: true, message: 'Aulas reordenadas com sucesso' };
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private async findModule(courseId: string, moduleId: string) {
    const m = await this.prisma.module.findFirst({ where: { moduleId, courseId } });
    if (!m) throw new NotFoundException('Módulo não encontrado neste curso');
    return m;
  }

  private async findLesson(moduleId: string, lessonId: string) {
    const l = await this.prisma.lesson.findFirst({ where: { lessonId, moduleId } });
    if (!l) throw new NotFoundException('Aula não encontrada neste módulo');
    return l;
  }

  private async nextOrder(tx: Prisma.TransactionClient, kind: 'module' | 'lesson', where: { courseId?: string; moduleId?: string }) {
    const agg =
      kind === 'module'
        ? await tx.module.aggregate({ where: { courseId: where.courseId }, _max: { order: true } })
        : await tx.lesson.aggregate({ where: { moduleId: where.moduleId }, _max: { order: true } });
    return (agg._max.order ?? 0) + 1;
  }

  /** mediaUrl tem de ser um asset do NOSSO Cloudinary, na pasta deste curso (ninguém aponta para URLs alheios). */
  private assertMedia(courseId: string, type: LessonType, mediaUrl: string | undefined, publishing: boolean) {
    if (mediaUrl && !this.storage.isOwnAssetUnder(mediaUrl, lessonFolder(courseId))) {
      throw new BadRequestException('mediaUrl inválido: use o upload assinado deste curso');
    }
    if (publishing && MEDIA_LESSONS.includes(type) && !mediaUrl) {
      throw new BadRequestException(`Uma aula de ${type} só pode ser publicada com ficheiro (mediaUrl)`);
    }
  }

  private assertSameSet(existing: string[], incoming: string[]) {
    const a = new Set(existing);
    if (incoming.length !== a.size || incoming.some((id) => !a.has(id))) {
      throw new BadRequestException('A lista de ids deve conter exactamente todos os itens existentes');
    }
  }

  private async notifyStudents(
    course: { courseId: string; title: string; status: PublicationStatus },
    message: string,
    metadata: Prisma.InputJsonObject,
    type: NotificationType = NotificationType.COURSE_MATERIAL_UPDATE,
  ) {
    if (course.status !== PublicationStatus.published) return; // rascunho: ninguém a acompanhar
    const userIds = await this.enrollments.enrolledUserIds(course.courseId);
    await this.notifications.notifyMany(userIds, type, {
      title: 'Novo conteúdo no curso',
      message: `${message} no curso "${course.title}".`,
      relatedEntityId: course.courseId,
      metadata: { courseId: course.courseId, ...metadata },
    });
  }
}
