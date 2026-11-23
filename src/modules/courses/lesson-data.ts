import { LessonType, Prisma } from '@prisma/client';
import type { CreateLessonDto } from './dto/content.dto';

export const MEDIA_LESSONS: LessonType[] = [LessonType.video, LessonType.audio, LessonType.pdf];

/** Campos de uma aula nova a partir do DTO (regras comuns a cursos, biblioteca e criação em lote). */
export function lessonCreateData(dto: CreateLessonDto, moduleId: string, creatorId: string, order: number): Prisma.LessonUncheckedCreateInput {
  const isFree = dto.isFree ?? false;
  return {
    moduleId, creatorId, order,
    title: dto.title, content: dto.content, lessonType: dto.lessonType ?? LessonType.video, level: dto.level,
    mediaUrl: dto.mediaUrl, externalResources: dto.externalResources ?? [], duration: dto.duration,
    isFree, price: isFree ? 0 : (dto.price ?? 0), isPublished: dto.isPublished ?? false,
  };
}
