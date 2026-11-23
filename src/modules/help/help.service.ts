import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminListArticlesQueryDto, CreateArticleDto, CreateCategoryDto, FeedbackDto, ListArticlesQueryDto, ListFeedbackQueryDto, UpdateArticleDto, UpdateCategoryDto,
} from './dto/help.dto';

const LIST_SELECT = {
  articleId: true, title: true, slug: true, category: true, excerpt: true, status: true,
  viewCount: true, feedbackCount: true, helpfulCount: true, rating: true, lastReviewedAt: true, createdAt: true, updatedAt: true,
} as const;

const slugOf = (title: string) =>
  title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '') || 'artigo';

const hasChanges = (o: object) => Object.values(o).some((v) => v !== undefined);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const isFk = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003';

/** Só artigos publicados em categorias activas são públicos. */
const PUBLIC_WHERE: Prisma.HelpArticleWhereInput = { status: PublicationStatus.published, categoryInfo: { isActive: true } };

@Injectable()
export class HelpService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categorias ───────────────────────────────────────────────────────────

  async categories() {
    const rows = await this.prisma.helpCategory.findMany({
      where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, icon: true, displayOrder: true, _count: { select: { articles: { where: { status: PublicationStatus.published } } } } },
    });
    return { success: true, data: rows.map(({ _count, ...c }) => ({ ...c, articleCount: _count.articles })) };
  }

  async adminCategories() {
    const rows = await this.prisma.helpCategory.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { articles: true } } } });
    return { success: true, data: rows.map(({ _count, ...c }) => ({ ...c, articleCount: _count.articles })) };
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return { success: true, data: await this.prisma.helpCategory.create({ data: dto }) };
    } catch (e) {
      if (isUnique(e)) throw new ConflictException({ message: 'Já existe uma categoria com esse nome', code: 'CATEGORY_EXISTS' });
      throw e;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    if (!hasChanges(dto)) throw new BadRequestException({ message: 'Nada para atualizar', code: 'NO_CHANGES' });
    try {
      // renomear propaga para os artigos (ON UPDATE CASCADE na FK por nome)
      return { success: true, data: await this.prisma.helpCategory.update({ where: { id }, data: dto }) };
    } catch (e) {
      if (isUnique(e)) throw new ConflictException({ message: 'Já existe uma categoria com esse nome', code: 'CATEGORY_EXISTS' });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw this.noCategory();
      throw e;
    }
  }

  async removeCategory(id: string) {
    try {
      await this.prisma.helpCategory.delete({ where: { id } });
    } catch (e) {
      if (isFk(e)) throw new ConflictException({ message: 'A categoria tem artigos; mova-os ou desative a categoria', code: 'CATEGORY_NOT_EMPTY' });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw this.noCategory();
      throw e;
    }
    return { success: true, message: 'Categoria eliminada' };
  }

  private noCategory() { return new NotFoundException({ message: 'Categoria não encontrada', code: 'CATEGORY_NOT_FOUND' }); }

  // ── Artigos (público) ────────────────────────────────────────────────────

  private textFilter(q?: string): Prisma.HelpArticleWhereInput {
    if (!q) return {};
    q = escapeLike(q);
    return { OR: [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }, { content: { contains: q, mode: 'insensitive' } }] };
  }

  async list(q: ListArticlesQueryDto) {
    const where: Prisma.HelpArticleWhereInput = { AND: [PUBLIC_WHERE, this.textFilter(q.q), q.category ? { category: q.category } : {}] };
    const [rows, total] = await Promise.all([
      this.prisma.helpArticle.findMany({ where, orderBy: [{ rating: 'desc' }, { viewCount: 'desc' }, { title: 'asc' }], skip: skipOf(q), take: q.limit, select: LIST_SELECT }),
      this.prisma.helpArticle.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async search(q: string, limit: number) {
    const rows = await this.prisma.helpArticle.findMany({
      where: { AND: [PUBLIC_WHERE, this.textFilter(q)] },
      // títulos que contêm o termo primeiro: ordenar em memória sobre um conjunto já limitado
      orderBy: [{ viewCount: 'desc' }], take: 100, select: LIST_SELECT,
    });
    const needle = q.toLowerCase();
    const ranked = rows
      .map((r) => ({ r, score: (r.title.toLowerCase().includes(needle) ? 2 : 0) + (r.excerpt?.toLowerCase().includes(needle) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.r);
    return { success: true, data: ranked };
  }

  async popular(limit: number) {
    const rows = await this.prisma.helpArticle.findMany({ where: PUBLIC_WHERE, orderBy: [{ viewCount: 'desc' }, { title: 'asc' }], take: limit, select: LIST_SELECT });
    return { success: true, data: rows };
  }

  /** Lê por slug e conta a visita (admin a ver rascunhos não conta). */
  async bySlug(slug: string, user?: AuthUser) {
    const isAdmin = user?.role === UserRole.admin;
    const art = await this.prisma.helpArticle.findFirst({ where: isAdmin ? { slug } : { slug, ...PUBLIC_WHERE }, select: { ...LIST_SELECT, content: true, reviewerId: true } });
    if (!art) throw new NotFoundException({ message: 'Artigo não encontrado', code: 'ARTICLE_NOT_FOUND' });
    if (art.status === PublicationStatus.published) {
      await this.prisma.helpArticle.update({ where: { articleId: art.articleId }, data: { viewCount: { increment: 1 } } });
      art.viewCount += 1;
    }
    const mine = user && (await this.prisma.helpFeedback.findUnique({
      where: { userId_articleId: { userId: user.userId, articleId: art.articleId } }, select: { wasHelpful: true, comment: true },
    }));
    return { success: true, data: { ...art, myFeedback: mine ?? null } };
  }

  // ── Artigos (admin) ──────────────────────────────────────────────────────

  async adminList(q: AdminListArticlesQueryDto) {
    const where: Prisma.HelpArticleWhereInput = { AND: [this.textFilter(q.q), q.category ? { category: q.category } : {}, q.status ? { status: q.status } : {}] };
    const [rows, total] = await Promise.all([
      this.prisma.helpArticle.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: skipOf(q), take: q.limit, select: LIST_SELECT }),
      this.prisma.helpArticle.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async adminGet(id: string) {
    const art = await this.prisma.helpArticle.findUnique({ where: { articleId: id } });
    if (!art) throw this.noArticle();
    return { success: true, data: art };
  }

  async create(admin: AuthUser, dto: CreateArticleDto) {
    await this.assertCategory(dto.category);
    const published = (dto.status ?? PublicationStatus.draft) === PublicationStatus.published;
    const base = slugOf(dto.title);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      try {
        const data = await this.prisma.helpArticle.create({
          data: {
            title: dto.title, slug, category: dto.category, content: dto.content, excerpt: dto.excerpt,
            status: dto.status ?? PublicationStatus.draft, reviewerId: admin.userId, lastReviewedAt: published ? new Date() : null,
          },
        });
        return { success: true, data };
      } catch (e) {
        if (isUnique(e)) continue;
        if (isFk(e)) throw this.noCategoryRef();
        throw e;
      }
    }
    throw new ConflictException({ message: 'Não foi possível gerar um slug único', code: 'SLUG_CONFLICT' });
  }

  async update(admin: AuthUser, id: string, dto: UpdateArticleDto) {
    if (!hasChanges(dto)) throw new BadRequestException({ message: 'Nada para atualizar', code: 'NO_CHANGES' });
    if (dto.category) await this.assertCategory(dto.category);
    try {
      // O slug mantém-se: alterar o título não pode partir ligações já partilhadas.
      return { success: true, data: await this.prisma.helpArticle.update({ where: { articleId: id }, data: { ...dto, reviewerId: admin.userId, lastReviewedAt: new Date() } }) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw this.noArticle();
      if (isFk(e)) throw this.noCategoryRef();
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.helpArticle.delete({ where: { articleId: id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw this.noArticle();
      throw e;
    }
    return { success: true, message: 'Artigo eliminado' };
  }

  private async assertCategory(name: string) {
    if (!(await this.prisma.helpCategory.findUnique({ where: { name }, select: { id: true } }))) throw this.noCategoryRef();
  }
  private noCategoryRef() { return new BadRequestException({ message: 'Categoria inexistente', code: 'CATEGORY_NOT_FOUND' }); }
  private noArticle() { return new NotFoundException({ message: 'Artigo não encontrado', code: 'ARTICLE_NOT_FOUND' }); }

  // ── Feedback ─────────────────────────────────────────────────────────────

  /** Um voto por utilizador e artigo; votar de novo altera o voto. */
  async giveFeedback(user: AuthUser, articleId: string, dto: FeedbackDto) {
    return this.mutateFeedback(articleId, true, async (tx) => {
      const data = await tx.helpFeedback.upsert({
        where: { userId_articleId: { userId: user.userId, articleId } },
        create: { userId: user.userId, articleId, wasHelpful: dto.wasHelpful, comment: dto.comment },
        update: { wasHelpful: dto.wasHelpful, comment: dto.comment ?? null },
        select: { feedbackId: true, wasHelpful: true, comment: true, updatedAt: true },
      });
      return data;
    });
  }

  async removeFeedback(user: AuthUser, articleId: string) {
    await this.mutateFeedback(articleId, false, async (tx) => {
      const { count } = await tx.helpFeedback.deleteMany({ where: { userId: user.userId, articleId } });
      if (!count) throw new NotFoundException({ message: 'Ainda não deu feedback a este artigo', code: 'FEEDBACK_NOT_FOUND' });
    });
    return { success: true, message: 'Feedback removido' };
  }

  /** Bloqueia o artigo, aplica a mudança e recalcula os agregados a partir dos votos (nunca por incremento). */
  private async mutateFeedback<T>(articleId: string, publishedOnly: boolean, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: PublicationStatus }[]>`SELECT "status" FROM "help_articles" WHERE "articleId" = ${articleId}::uuid FOR UPDATE`;
      if (!locked.length || (publishedOnly && locked[0].status !== PublicationStatus.published)) throw this.noArticle();
      const out = await fn(tx);
      const [total, helpful] = await Promise.all([
        tx.helpFeedback.count({ where: { articleId } }),
        tx.helpFeedback.count({ where: { articleId, wasHelpful: true } }),
      ]);
      const article = await tx.helpArticle.update({
        where: { articleId },
        data: { feedbackCount: total, helpfulCount: helpful, rating: total ? Math.round((helpful / total) * 500) / 100 : 0 },
        select: { articleId: true, feedbackCount: true, helpfulCount: true, rating: true },
      });
      return { out, article };
    });
    return { success: true, data: { ...(result.out ?? {}), article: result.article } };
  }

  async listFeedback(q: ListFeedbackQueryDto) {
    const where: Prisma.HelpFeedbackWhereInput = { ...(q.articleId && { articleId: q.articleId }), ...(q.wasHelpful !== undefined && { wasHelpful: q.wasHelpful }) };
    const [rows, total] = await Promise.all([
      this.prisma.helpFeedback.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: {
          feedbackId: true, wasHelpful: true, comment: true, createdAt: true,
          user: { select: { userId: true, username: true, fullName: true } }, article: { select: { articleId: true, title: true, slug: true } },
        },
      }),
      this.prisma.helpFeedback.count({ where }),
    ]);
    return paginated(rows, total, q);
  }
}
