import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ALLOWED_MIME, MAX_FILE_SIZE, UPLOAD_POLICIES } from '@/common/config/upload.config';
import { CurrentUser, OptionalAuth, RequireApproved } from '@/common/decorators/auth.decorators';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import {
  CreateStudyGroupDto, InviteUsersDto, JoinGroupDto, ListMeetingsQueryDto, ListStudyGroupsQueryDto, MeetingDto, MembersQueryDto,
  ReviewRequestDto, RsvpDto, StatsQueryDto, TransferLeadershipDto, UpdateMeetingDto, UpdateMemberDto, UpdateStudyGroupDto,
} from './dto/study-group.dto';
import { StudyGroupMeetingsService } from './study-group-meetings.service';
import { StudyGroupMembersService } from './study-group-members.service';
import { StudyGroupsService } from './study-groups.service';

const uuid = () => new ParseUUIDPipe();
const coverInterceptor = () =>
  FileInterceptor('coverImage', {
    limits: { fileSize: MAX_FILE_SIZE.IMAGE, files: 1 },
    fileFilter: (_r, f, cb) => ((ALLOWED_MIME.images as readonly string[]).includes(f.mimetype) ? cb(null, true) : cb(new BadRequestException('A capa deve ser JPEG, PNG ou WEBP'), false)),
  });
const coverPipe = () => new FileValidationPipe({ ...UPLOAD_POLICIES.coverImage, required: false });

/** Rotas estáticas (`invites/me`) antes de `:groupId`. */
@Controller('study-groups')
export class StudyGroupsController {
  constructor(
    private readonly groups: StudyGroupsService,
    private readonly members: StudyGroupMembersService,
    private readonly meetings: StudyGroupMeetingsService,
  ) {}

  @OptionalAuth() @Get()
  list(@CurrentUser() user: AuthUser | undefined, @Query() q: ListStudyGroupsQueryDto) {
    return this.groups.list(user, q);
  }

  @Get('invites/me')
  myInvites(@CurrentUser('userId') userId: string, @Query() q: PaginationQueryDto) {
    return this.members.myInvites(userId, q);
  }

  @RequireApproved() @Post() @UseInterceptors(coverInterceptor())
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudyGroupDto, @UploadedFile(coverPipe()) cover?: Express.Multer.File) {
    return this.groups.create(user, dto, cover);
  }

  @OptionalAuth() @Get(':groupId')
  detail(@CurrentUser() user: AuthUser | undefined, @Param('groupId', uuid()) id: string) {
    return this.groups.getDetail(id, user);
  }

  @Patch(':groupId') @UseInterceptors(coverInterceptor())
  update(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Body() dto: UpdateStudyGroupDto, @UploadedFile(coverPipe()) cover?: Express.Multer.File) {
    return this.groups.update(user, id, dto, cover);
  }

  @Delete(':groupId')
  remove(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.groups.remove(user, id);
  }

  @Post(':groupId/invite-code/regenerate') @HttpCode(200)
  regenerate(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.groups.regenerateCode(user, id);
  }

  @Get(':groupId/invite-code/:code')
  verifyCode(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('code') code: string) {
    return this.members.verifyCode(user, id, code);
  }

  @Get(':groupId/stats')
  stats(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Query() q: StatsQueryDto) {
    return this.groups.stats(user, id, q.period);
  }

  @Get(':groupId/leaderboard')
  leaderboard(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.groups.leaderboard(user, id);
  }

  // — entrada e saída —
  @RequireApproved() @Post(':groupId/join') @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Body() dto: JoinGroupDto) {
    return this.members.join(user, id, dto);
  }

  @Delete(':groupId/membership')
  leave(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.members.leave(user, id);
  }

  @Get(':groupId/membership/me')
  myMembership(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.members.myMembership(user, id);
  }

  @Get(':groupId/join-status')
  joinStatus(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string) {
    return this.members.joinStatus(user, id);
  }

  // — membros —
  @Get(':groupId/members')
  listMembers(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Query() q: MembersQueryDto) {
    return this.members.list(user, id, q);
  }

  @Patch(':groupId/members/:userId')
  updateMember(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('userId', uuid()) uid: string, @Body() dto: UpdateMemberDto) {
    return this.members.updateMember(user, id, uid, dto);
  }

  @Delete(':groupId/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('userId', uuid()) uid: string) {
    return this.members.removeMember(user, id, uid);
  }

  @Post(':groupId/transfer-leadership') @HttpCode(200)
  transfer(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Body() dto: TransferLeadershipDto) {
    return this.members.transferLeadership(user, id, dto.userId);
  }

  // — pedidos e convites —
  @Get(':groupId/requests')
  requests(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Query() q: PaginationQueryDto) {
    return this.members.requests(user, id, q);
  }

  @Post(':groupId/requests/:requestId/approve') @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('requestId', uuid()) rid: string, @Body() dto: ReviewRequestDto) {
    return this.members.review(user, id, rid, true, dto.responseMessage);
  }

  @Post(':groupId/requests/:requestId/reject') @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('requestId', uuid()) rid: string, @Body() dto: ReviewRequestDto) {
    return this.members.review(user, id, rid, false, dto.responseMessage);
  }

  @Post(':groupId/invites')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  invite(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Body() dto: InviteUsersDto) {
    return this.members.invite(user, id, dto.userIds);
  }

  @Get(':groupId/invites')
  invites(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Query() q: PaginationQueryDto) {
    return this.members.listInvites(user, id, q);
  }

  @Delete(':groupId/invites/:requestId')
  revoke(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('requestId', uuid()) rid: string) {
    return this.members.revokeInvite(user, id, rid);
  }

  @Post(':groupId/invite/decline') @HttpCode(200)
  decline(@CurrentUser('userId') userId: string, @Param('groupId', uuid()) id: string) {
    return this.members.declineInvite(userId, id);
  }

  // — reuniões —
  @Get(':groupId/meetings')
  listMeetings(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Query() q: ListMeetingsQueryDto) {
    return this.meetings.list(user, id, q);
  }

  @RequireApproved() @Post(':groupId/meetings')
  createMeeting(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Body() dto: MeetingDto) {
    return this.meetings.create(user, id, dto);
  }

  @Get(':groupId/meetings/:meetingId')
  meeting(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('meetingId', uuid()) mid: string) {
    return this.meetings.detail(user, id, mid);
  }

  @Patch(':groupId/meetings/:meetingId')
  updateMeeting(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('meetingId', uuid()) mid: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user, id, mid, dto);
  }

  @Delete(':groupId/meetings/:meetingId')
  deleteMeeting(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('meetingId', uuid()) mid: string) {
    return this.meetings.remove(user, id, mid);
  }

  @Post(':groupId/meetings/:meetingId/rsvp') @HttpCode(200)
  rsvp(@CurrentUser() user: AuthUser, @Param('groupId', uuid()) id: string, @Param('meetingId', uuid()) mid: string, @Body() dto: RsvpDto) {
    return this.meetings.rsvp(user, id, mid, dto.status);
  }
}
