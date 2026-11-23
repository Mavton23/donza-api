import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import {
  AdminReviewsQueryDto, CreateReviewDto, ListReviewsQueryDto, ReceivedReviewsQueryDto, ReplyDto, UpdateReviewDto, VisibilityDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

const uuid = () => new ParseUUIDPipe();
const CREATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const OWNERS = [UserRole.instructor, UserRole.institution, UserRole.admin] as const;

/**
 * Rotas de avaliações de cursos e eventos. As estáticas (`reviews/received`, `reviews/analytics`,
 * `admin/reviews`) vêm antes de `reviews/:reviewId`.
 */
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // ── Cursos ───────────────────────────────────────────────────────────────
  @OptionalAuth() @Get('courses/:idOrSlug/reviews')
  courseList(@Param('idOrSlug') id: string, @Query() q: ListReviewsQueryDto, @CurrentUser() u?: AuthUser) { return this.reviews.list('course', id, q, u); }

  @OptionalAuth() @Get('courses/:idOrSlug/reviews/summary')
  courseSummary(@Param('idOrSlug') id: string, @CurrentUser() u?: AuthUser) { return this.reviews.summary('course', id, u); }

  @Get('courses/:courseId/reviews/eligibility')
  courseEligibility(@Param('courseId', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.reviews.canReview('course', id, u); }

  @RequireApproved() @Throttle(CREATE_LIMIT) @Post('courses/:courseId/reviews')
  courseCreate(@Param('courseId', uuid()) id: string, @CurrentUser() u: AuthUser, @Body() dto: CreateReviewDto) { return this.reviews.create('course', id, u, dto); }

  // ── Eventos ──────────────────────────────────────────────────────────────
  @OptionalAuth() @Get('events/:eventId/reviews')
  eventList(@Param('eventId', uuid()) id: string, @Query() q: ListReviewsQueryDto) { return this.reviews.list('event', id, q); }

  @OptionalAuth() @Get('events/:eventId/reviews/summary')
  eventSummary(@Param('eventId', uuid()) id: string) { return this.reviews.summary('event', id); }

  @Get('events/:eventId/reviews/eligibility')
  eventEligibility(@Param('eventId', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.reviews.canReview('event', id, u); }

  @RequireApproved() @Throttle(CREATE_LIMIT) @Post('events/:eventId/reviews')
  eventCreate(@Param('eventId', uuid()) id: string, @CurrentUser() u: AuthUser, @Body() dto: CreateReviewDto) { return this.reviews.create('event', id, u, dto); }

  // ── Donos e admin (rotas estáticas) ──────────────────────────────────────
  @Roles(...OWNERS) @Get('reviews/received')
  received(@CurrentUser() u: AuthUser, @Query() q: ReceivedReviewsQueryDto) { return this.reviews.received(u, q); }

  @Roles(...OWNERS) @Get('reviews/analytics')
  analytics(@CurrentUser() u: AuthUser) { return this.reviews.analytics(u); }

  @Roles(UserRole.admin) @Get('admin/reviews')
  adminList(@Query() q: AdminReviewsQueryDto) { return this.reviews.adminList(q); }

  // ── Uma avaliação ────────────────────────────────────────────────────────
  @Patch('reviews/:reviewId')
  update(@Param('reviewId', uuid()) id: string, @CurrentUser() u: AuthUser, @Body() dto: UpdateReviewDto) { return this.reviews.update(u, id, dto); }

  @Delete('reviews/:reviewId')
  remove(@Param('reviewId', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.reviews.remove(u, id); }

  @Roles(...OWNERS) @Put('reviews/:reviewId/reply')
  reply(@Param('reviewId', uuid()) id: string, @CurrentUser() u: AuthUser, @Body() dto: ReplyDto) { return this.reviews.reply(u, id, dto); }

  @Roles(...OWNERS) @Delete('reviews/:reviewId/reply')
  removeReply(@Param('reviewId', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.reviews.removeReply(u, id); }

  @Roles(UserRole.admin) @Patch('reviews/:reviewId/visibility')
  visibility(@Param('reviewId', uuid()) id: string, @Body() dto: VisibilityDto) { return this.reviews.setVisibility(id, dto.isPublic); }
}
