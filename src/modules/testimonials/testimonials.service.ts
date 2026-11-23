import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, NotificationType, Prisma, TestimonialSource, UserRole } from '@prisma/client';
import { displayName } from '../courses/course-access';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminListTestimonialsQueryDto, CreateExternalTestimonialDto, CreateTestimonialDto, ListTestimonialsQueryDto, ModerateTestimonialDto, UpdateTestimonialDto,
} from './dto/testimonial.dto';

const AUTHOR = { userId: true, username: true, fullName: true, institutionName: true, avatarUrl: true, role: true } as const;
const ROW = {
  testimonialId: true, content: true, rating: true, featured: true, status: true, source: true, createdAt: true, updatedAt: true,
  externalAuthor: true, externalRole: true, externalAvatarUrl: true, author: { select: AUTHOR },
} as const;
type Row = Prisma.TestimonialGetPayload<{ select: typeof ROW }>;

/** Forma pública: nunca expõe email, userId nem estado de moderação. */
function publicShape(t: Row) {
  const a = t.author;
  return {
    testimonialId: t.testimonialId, content: t.content, rating: t.rating, featured: t.featured, createdAt: t.createdAt,
    author: t.source === TestimonialSource.external || !a
      ? { name: t.externalAuthor ?? 'Utilizador', role: t.externalRole, avatarUrl: t.externalAvatarUrl }
      : { name: displayName(a), role: a.role, avatarUrl: a.avatarUrl },
  };
}

@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  // ── Público ──────────────────────────────────────────────────────────────

  async list(q: ListTestimonialsQueryDto) {
    const where: Prisma.TestimonialWhereInput = { status: ApprovalStatus.approved, ...(q.minRating && { rating: { gte: q.minRating } }) };
    const [rows, total] = await Promise.all([
      this.prisma.testimonial.findMany({ where, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], skip: skipOf(q), take: q.limit, select: ROW }),
      this.prisma.testimonial.count({ where }),
    ]);
    return paginated(rows.map(publicShape), total, q);
  }

  async featured(limit: number) {
    const rows = await this.prisma.testimonial.findMany({
      where: { status: ApprovalStatus.approved, featured: true }, orderBy: { createdAt: 'desc' }, take: limit, select: ROW,
    });
    return { success: true, data: rows.map(publicShape) };
  }

  // ── Autor ────────────────────────────────────────────────────────────────

  /** O meu testemunho (com estado de moderação), ou `null`. */
  async mine(user: AuthUser) {
    const t = await this.prisma.testimonial.findFirst({ where: { userId: user.userId, source: TestimonialSource.platform }, select: ROW });
    return { success: true, data: t && { ...publicShape(t), status: t.status } };
  }

  async create(user: AuthUser, dto: CreateTestimonialDto) {
    try {
      const t = await this.prisma.testimonial.create({
        data: { userId: user.userId, content: dto.content, rating: dto.rating, source: TestimonialSource.platform }, select: ROW,
      });
      return { success: true, message: 'Obrigado! O seu testemunho será publicado após revisão.', data: { ...publicShape(t), status: t.status } };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já enviou um testemunho; edite o existente');
      }
      throw err;
    }
  }

  /** Editar volta a pô-lo em revisão (e tira-o do destaque): o texto aprovado não pode mudar sem nova aprovação. */
  async update(user: AuthUser, id: string, dto: UpdateTestimonialDto) {
    const t = await this.prisma.testimonial.findUnique({ where: { testimonialId: id }, select: { userId: true, source: true } });
    if (!t) throw new NotFoundException('Testemunho não encontrado');
    if (t.userId !== user.userId || t.source !== TestimonialSource.platform) throw new ForbiddenException('Só o autor pode editar este testemunho');
    const u = await this.prisma.testimonial.update({
      where: { testimonialId: id },
      data: { ...(dto.content !== undefined && { content: dto.content }), ...(dto.rating !== undefined && { rating: dto.rating }), status: ApprovalStatus.pending, featured: false },
      select: ROW,
    });
    return { success: true, message: 'Testemunho actualizado; aguarda nova revisão.', data: { ...publicShape(u), status: u.status } };
  }

  /** Autor ou admin. */
  async remove(user: AuthUser, id: string) {
    const t = await this.prisma.testimonial.findUnique({ where: { testimonialId: id }, select: { userId: true } });
    if (!t) throw new NotFoundException('Testemunho não encontrado');
    if (t.userId !== user.userId && user.role !== UserRole.admin) throw new ForbiddenException('Sem permissão para apagar este testemunho');
    await this.prisma.testimonial.delete({ where: { testimonialId: id } });
    return { success: true, message: 'Testemunho removido' };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(q: AdminListTestimonialsQueryDto) {
    const where: Prisma.TestimonialWhereInput = { ...(q.status && { status: q.status }), ...(q.featured !== undefined && { featured: q.featured }) };
    const [rows, total] = await Promise.all([
      this.prisma.testimonial.findMany({
        where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: skipOf(q), take: q.limit,
        select: { ...ROW, author: { select: { ...AUTHOR, email: true } } },
      }),
      this.prisma.testimonial.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async createExternal(dto: CreateExternalTestimonialDto) {
    const t = await this.prisma.testimonial.create({
      data: {
        content: dto.content, rating: dto.rating, source: TestimonialSource.external, status: ApprovalStatus.approved, featured: dto.featured ?? false,
        externalAuthor: dto.externalAuthor, externalRole: dto.externalRole, externalAvatarUrl: dto.externalAvatarUrl,
      },
      select: ROW,
    });
    return { success: true, data: { ...publicShape(t), status: t.status } };
  }

  /** `featured` só vale em testemunhos aprovados (também garantido por CHECK na base de dados). */
  async moderate(id: string, dto: ModerateTestimonialDto) {
    const t = await this.prisma.testimonial.findUnique({ where: { testimonialId: id }, select: { userId: true, status: true, featured: true } });
    if (!t) throw new NotFoundException('Testemunho não encontrado');
    const featured = dto.status === 'approved' ? (dto.featured ?? t.featured) : false;
    const u = await this.prisma.testimonial.update({ where: { testimonialId: id }, data: { status: dto.status, featured }, select: ROW });
    if (t.userId && t.status !== dto.status) {
      await this.notifications.notify(t.userId, NotificationType.DONZA_NOTIFICATION, {
        title: dto.status === 'approved' ? 'Testemunho publicado' : 'Testemunho não aprovado',
        message: dto.status === 'approved' ? 'O seu testemunho foi aprovado e já está visível. Obrigado!' : 'O seu testemunho não foi aprovado. Pode editá-lo e voltar a submetê-lo.',
        relatedEntityId: id,
      });
    }
    return { success: true, data: { ...publicShape(u), status: u.status } };
  }
}
