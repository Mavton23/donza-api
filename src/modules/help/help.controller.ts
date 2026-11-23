import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, Public, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import {
  AdminListArticlesQueryDto, CreateArticleDto, CreateCategoryDto, FeedbackDto, ListArticlesQueryDto, ListFeedbackQueryDto, PopularQueryDto, SearchQueryDto, UpdateArticleDto, UpdateCategoryDto,
} from './dto/help.dto';
import { HelpService } from './help.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`search`, `popular-topics`, `admin/*`, `feedback`) antes das paramétricas. */
@Controller('help')
export class HelpController {
  constructor(private readonly svc: HelpService) {}

  // público
  @Public() @Get('categories') categories() { return this.svc.categories(); }
  @Public() @Get('articles') list(@Query() q: ListArticlesQueryDto) { return this.svc.list(q); }
  @Public() @Get('search') search(@Query() q: SearchQueryDto) { return this.svc.search(q.q, q.limit); }
  @Public() @Get('popular-topics') popular(@Query() q: PopularQueryDto) { return this.svc.popular(q.limit); }

  // admin
  @Roles(UserRole.admin) @Get('admin/categories') adminCategories() { return this.svc.adminCategories(); }
  @Roles(UserRole.admin) @Post('categories') createCategory(@Body() dto: CreateCategoryDto) { return this.svc.createCategory(dto); }
  @Roles(UserRole.admin) @Patch('categories/:id') updateCategory(@Param('id', uuid()) id: string, @Body() dto: UpdateCategoryDto) { return this.svc.updateCategory(id, dto); }
  @Roles(UserRole.admin) @Delete('categories/:id') removeCategory(@Param('id', uuid()) id: string) { return this.svc.removeCategory(id); }

  @Roles(UserRole.admin) @Get('admin/articles') adminList(@Query() q: AdminListArticlesQueryDto) { return this.svc.adminList(q); }
  @Roles(UserRole.admin) @Get('admin/articles/:id') adminGet(@Param('id', uuid()) id: string) { return this.svc.adminGet(id); }
  @Roles(UserRole.admin) @Get('feedback') feedback(@Query() q: ListFeedbackQueryDto) { return this.svc.listFeedback(q); }
  @Roles(UserRole.admin) @Post('articles') create(@CurrentUser() u: AuthUser, @Body() dto: CreateArticleDto) { return this.svc.create(u, dto); }
  @Roles(UserRole.admin) @Patch('articles/:id') update(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateArticleDto) { return this.svc.update(u, id, dto); }
  @Roles(UserRole.admin) @Delete('articles/:id') remove(@Param('id', uuid()) id: string) { return this.svc.remove(id); }

  // feedback (autenticado)
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) @Post('articles/:id/feedback')
  giveFeedback(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: FeedbackDto) { return this.svc.giveFeedback(u, id, dto); }
  @Delete('articles/:id/feedback') removeFeedback(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.removeFeedback(u, id); }

  // por slug (última: apanha tudo o resto sob /articles/)
  @OptionalAuth() @Get('articles/:slug') bySlug(@Param('slug') slug: string, @CurrentUser() u?: AuthUser) { return this.svc.bySlug(slug, u); }
}
