import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Public, RequireApproved, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import {
  AdminListTestimonialsQueryDto, CreateExternalTestimonialDto, CreateTestimonialDto, FeaturedQueryDto, ListTestimonialsQueryDto, ModerateTestimonialDto, UpdateTestimonialDto,
} from './dto/testimonial.dto';
import { TestimonialsService } from './testimonials.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`featured`, `me`, `admin`) antes de `:id`. */
@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly svc: TestimonialsService) {}

  @Public() @Get() list(@Query() q: ListTestimonialsQueryDto) { return this.svc.list(q); }

  @Public() @Get('featured') featured(@Query() q: FeaturedQueryDto) { return this.svc.featured(q.limit); }

  @Get('me') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u); }

  @RequireApproved() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateTestimonialDto) { return this.svc.create(u, dto); }

  @Roles(UserRole.admin) @Get('admin') adminList(@Query() q: AdminListTestimonialsQueryDto) { return this.svc.adminList(q); }

  @Roles(UserRole.admin) @Post('admin/external')
  createExternal(@Body() dto: CreateExternalTestimonialDto) { return this.svc.createExternal(dto); }

  @Roles(UserRole.admin) @Patch(':id/moderation')
  moderate(@Param('id', uuid()) id: string, @Body() dto: ModerateTestimonialDto) { return this.svc.moderate(id, dto); }

  @Patch(':id') update(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser, @Body() dto: UpdateTestimonialDto) { return this.svc.update(u, id, dto); }

  @Delete(':id') remove(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(u, id); }
}
