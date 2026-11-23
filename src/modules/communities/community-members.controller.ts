import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, OptionalAuth, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { CommunityMembersService } from './community-members.service';
import { AssignRolesDto, CreateRoleDto, InviteDto, MembersQueryDto, UpdateMemberDto, UpdateRoleDto } from './dto/community.dto';

const uuid = () => new ParseUUIDPipe();

@Controller('communities/:communityId')
export class CommunityMembersController {
  constructor(private readonly svc: CommunityMembersService) {}

  // — o próprio utilizador —
  @Get('membership/me')
  me(@CurrentUser('userId') userId: string, @Param('communityId', uuid()) id: string) {
    return this.svc.myMembership(userId, id);
  }

  @RequireApproved() @Post('join') @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string) {
    return this.svc.join(user, id);
  }

  @Delete('membership')
  leave(@CurrentUser('userId') userId: string, @Param('communityId', uuid()) id: string) {
    return this.svc.leave(userId, id);
  }

  // — membros —
  /** Aceita UUID ou slug (a regra de visibilidade da comunidade aplica-se). */
  @OptionalAuth() @Get('members')
  members(@CurrentUser() user: AuthUser | undefined, @Param('communityId') id: string, @Query() q: MembersQueryDto) {
    return this.svc.list(user, id, q);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Query() q: PaginationQueryDto) {
    return this.svc.pendingRequests(user, id, q);
  }

  @Post('requests/:userId/approve') @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('userId', uuid()) uid: string) {
    return this.svc.reviewRequest(user, id, uid, true);
  }

  @Post('requests/:userId/reject') @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('userId', uuid()) uid: string) {
    return this.svc.reviewRequest(user, id, uid, false);
  }

  @Patch('members/:userId')
  updateMember(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('userId', uuid()) uid: string, @Body() dto: UpdateMemberDto) {
    return this.svc.updateMember(user, id, uid, dto);
  }

  @Delete('members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('userId', uuid()) uid: string) {
    return this.svc.removeMember(user, id, uid);
  }

  @Put('members/:userId/roles')
  assign(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('userId', uuid()) uid: string, @Body() dto: AssignRolesDto) {
    return this.svc.assignRoles(user, id, uid, dto.roleIds);
  }

  // — papéis personalizados —
  @Get('roles')
  roles(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string) {
    return this.svc.listRoles(user, id);
  }

  @Post('roles')
  createRole(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Body() dto: CreateRoleDto) {
    return this.svc.createRole(user, id, dto);
  }

  @Patch('roles/:roleId')
  updateRole(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('roleId', uuid()) rid: string, @Body() dto: UpdateRoleDto) {
    return this.svc.updateRole(user, id, rid, dto);
  }

  @Delete('roles/:roleId')
  deleteRole(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('roleId', uuid()) rid: string) {
    return this.svc.deleteRole(user, id, rid);
  }

  // — convites —
  @Post('invites')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  invite(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Body() dto: InviteDto) {
    return this.svc.invite(user, id, dto.email);
  }

  @Get('invites')
  invites(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Query() q: PaginationQueryDto) {
    return this.svc.listInvites(user, id, q);
  }

  @Delete('invites/:inviteId')
  revoke(@CurrentUser() user: AuthUser, @Param('communityId', uuid()) id: string, @Param('inviteId', uuid()) inv: string) {
    return this.svc.revokeInvite(user, id, inv);
  }
}
