import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, OptionalAuth } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { GlobalSearchQueryDto, MessageableQueryDto, QueryOnlyDto, SearchInstructorsQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @OptionalAuth() @Throttle({ default: { limit: 60, ttl: 60_000 } }) @Get()
  global(@CurrentUser() u: AuthUser | undefined, @Query() q: GlobalSearchQueryDto) { return this.svc.global(u, q); }
  @OptionalAuth() @Get('instructors') instructors(@CurrentUser() u: AuthUser | undefined, @Query() q: SearchInstructorsQueryDto) { return this.svc.instructors(u, q); }
  @Get('messageable-users') messageable(@CurrentUser() u: AuthUser, @Query() q: MessageableQueryDto) { return this.svc.messageable(u, q); }
  @Get('enrolled-courses') enrolled(@CurrentUser() u: AuthUser, @Query() q: QueryOnlyDto) { return this.svc.enrolledCourses(u, q); }
}
