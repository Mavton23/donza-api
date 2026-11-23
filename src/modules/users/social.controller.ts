import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { SearchUsersQueryDto, SetPrivacyDto } from './dto/social.dto';
import { SocialService } from './social.service';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`me`, `search`, `by-username`) antes de `:userId`. */
@Controller('users')
export class SocialController {
  constructor(private readonly svc: SocialService) {}

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.me(u); }
  @Patch('me/privacy') privacy(@CurrentUser() u: AuthUser, @Body() dto: SetPrivacyDto) { return this.svc.setPrivacy(u, dto); }
  @Get('me/follow-requests') incoming(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) { return this.svc.incomingRequests(u, q); }
  @Get('me/follow-requests/sent') sent(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) { return this.svc.sentRequests(u, q); }
  @HttpCode(200) @Post('me/follow-requests/:userId/accept') accept(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.acceptRequest(u, id); }
  @HttpCode(200) @Post('me/follow-requests/:userId/decline') decline(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.declineRequest(u, id); }
  @Delete('me/followers/:userId') removeFollower(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.removeFollower(u, id); }
  @Get('search') search(@CurrentUser() u: AuthUser, @Query() q: SearchUsersQueryDto) { return this.svc.search(u, q); }
  @Get('by-username/:username') byUsername(@CurrentUser() u: AuthUser, @Param('username') username: string) { return this.svc.profile(u, { username: username.slice(0, 50) }); }

  @Get(':userId/profile') profile(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.profile(u, { userId: id }); }
  @Get(':userId/follow-status') status(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.followStatus(u, id); }
  @Get(':userId/followers') followers(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: PaginationQueryDto) { return this.svc.followers(u, id, q); }
  @Get(':userId/following') following(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string, @Query() q: PaginationQueryDto) { return this.svc.following(u, id, q); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post(':userId/follow')
  follow(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.follow(u, id); }
  @Delete(':userId/follow') unfollow(@CurrentUser() u: AuthUser, @Param('userId', uuid()) id: string) { return this.svc.unfollow(u, id); }
}

@Controller('public')
export class PublicStatsController {
  constructor(private readonly svc: SocialService) {}

  @Public() @Get('stats') stats() { return this.svc.publicStats(); }
}
