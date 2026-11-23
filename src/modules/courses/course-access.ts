import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** Quem pode gerir (editar/apagar/publicar) um curso: o instrutor, a instituição organizadora e o admin. */
export function canManage(user: AuthUser | undefined, course: { instructorId: string; organizerId: string | null }) {
  if (!user) return false;
  return user.role === UserRole.admin || course.instructorId === user.userId || course.organizerId === user.userId;
}

/** Procura por UUID ou slug (os slugs têm sufixo aleatório, nunca colidem com rotas estáticas). */
export const courseWhere = (idOrSlug: string) => (isUUID(idOrSlug) ? { courseId: idOrSlug } : { slug: idOrSlug });

const MANAGE_SELECT = {
  courseId: true,
  title: true,
  slug: true,
  instructorId: true,
  organizerId: true,
  status: true,
  isPublic: true,
  price: true,
  coverImageUrl: true,
} as const;

export async function getManageableCourse(prisma: PrismaService, courseId: string, user: AuthUser) {
  const course = await prisma.course.findUnique({ where: { courseId }, select: MANAGE_SELECT });
  if (!course) throw new NotFoundException('Curso não encontrado');
  if (!canManage(user, course)) throw new ForbiddenException('Você não tem permissão para gerir este curso');
  return course;
}

/** Nome a mostrar do criador: instituição usa o nome da instituição. */
export function displayName(u: { role: UserRole; institutionName: string | null; fullName: string | null; username: string }) {
  return u.role === UserRole.institution ? (u.institutionName ?? u.username) : (u.fullName ?? u.username);
}

export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'curso';
}
