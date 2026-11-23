import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { MAX_FILE_SIZE } from '@/common/config/upload.config';
import { CurrentUser, RequireApproved } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { PaginationQueryDto } from '@/common/utils/pagination';
import {
  AssignTaskDto, CreateContentDto, CreateTaskDto, CreateTopicDto, ListContentsQueryDto, ListRepliesQueryDto, ListTasksQueryDto, ListTopicsQueryDto,
  MyAssignmentDto, ReplyDto, ReportTopicDto, UpdateContentDto, UpdateTaskDto, UpdateTopicDto, VoteDto,
} from './dto/group-work.dto';
import { ListReportsQueryDto, MonthQueryDto, TaskReportQueryDto, WeekQueryDto } from './dto/group-reports.dto';
import { StudyGroupAchievementsService } from './study-group-achievements.service';
import { StudyGroupReportsService } from './study-group-reports.service';
import { StudyGroupContentsService } from './study-group-contents.service';
import { StudyGroupDiscussionsService } from './study-group-discussions.service';
import { StudyGroupTasksService } from './study-group-tasks.service';

const uuid = () => new ParseUUIDPipe();

@Controller('study-groups/:groupId/tasks')
export class StudyGroupTasksController {
  constructor(private readonly tasks: StudyGroupTasksService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListTasksQueryDto) { return this.tasks.list(u, g, q); }

  @RequireApproved() @Post() @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: CreateTaskDto) { return this.tasks.create(u, g, dto); }

  @Get(':taskId') detail(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string) { return this.tasks.detail(u, g, t); }

  @RequireApproved() @Patch(':taskId')
  update(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string, @Body() dto: UpdateTaskDto) { return this.tasks.update(u, g, t, dto); }

  @Delete(':taskId') remove(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string) { return this.tasks.remove(u, g, t); }

  @RequireApproved() @Post(':taskId/assignees') @HttpCode(200)
  assign(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string, @Body() dto: AssignTaskDto) { return this.tasks.assign(u, g, t, dto); }

  @Delete(':taskId/assignees/:userId')
  unassign(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string, @Param('userId', uuid()) uid: string) { return this.tasks.unassign(u, g, t, uid); }

  @RequireApproved() @Patch(':taskId/assignment/me')
  mine(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('taskId', uuid()) t: string, @Body() dto: MyAssignmentDto) { return this.tasks.updateMine(u, g, t, dto); }
}

@Controller('study-groups/:groupId/contents')
export class StudyGroupContentsController {
  constructor(private readonly contents: StudyGroupContentsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListContentsQueryDto) { return this.contents.list(u, g, q); }

  /** multipart: `file` (opcional) + title, description, fileType, externalUrl */
  @RequireApproved() @Post() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE.BATCH_ATTACHMENT, files: 1 } }))
  create(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: CreateContentDto, @UploadedFile() file?: Express.Multer.File) { return this.contents.create(u, g, dto, file); }

  @Get(':contentId') detail(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('contentId', uuid()) c: string) { return this.contents.detail(u, g, c); }

  @RequireApproved() @Post(':contentId/download') @HttpCode(200)
  download(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('contentId', uuid()) c: string) { return this.contents.download(u, g, c); }

  @RequireApproved() @Patch(':contentId')
  update(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('contentId', uuid()) c: string, @Body() dto: UpdateContentDto) { return this.contents.update(u, g, c, dto); }

  @Delete(':contentId') remove(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('contentId', uuid()) c: string) { return this.contents.remove(u, g, c); }
}

@Controller('study-groups/:groupId')
export class StudyGroupDiscussionsController {
  constructor(private readonly d: StudyGroupDiscussionsService) {}

  @Get('topics') list(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListTopicsQueryDto) { return this.d.list(u, g, q); }

  @RequireApproved() @Post('topics') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Body() dto: CreateTopicDto) { return this.d.create(u, g, dto); }

  @Get('topics/reports') reports(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: PaginationQueryDto) { return this.d.listReports(u, g, q); }

  @Post('topics/reports/:reportId/resolve') @HttpCode(200)
  resolve(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('reportId', uuid()) r: string) { return this.d.resolveReport(u, g, r); }

  @Get('topics/:topicId') detail(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string) { return this.d.detail(u, g, t); }

  @RequireApproved() @Patch('topics/:topicId')
  update(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Body() dto: UpdateTopicDto) { return this.d.update(u, g, t, dto); }

  @Delete('topics/:topicId') remove(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string) { return this.d.remove(u, g, t); }

  @RequireApproved() @Post('topics/:topicId/report') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Body() dto: ReportTopicDto) { return this.d.report(u, g, t, dto); }

  @Get('topics/:topicId/replies')
  replies(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Query() q: ListRepliesQueryDto) { return this.d.listReplies(u, g, t, q); }

  @RequireApproved() @Post('topics/:topicId/replies') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  addReply(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Body() dto: ReplyDto) { return this.d.addReply(u, g, t, dto); }

  @RequireApproved() @Patch('topics/:topicId/replies/:replyId')
  updateReply(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string, @Body() dto: ReplyDto) { return this.d.updateReply(u, g, t, r, dto); }

  @Delete('topics/:topicId/replies/:replyId')
  removeReply(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string) { return this.d.removeReply(u, g, t, r); }

  @RequireApproved() @Put('topics/:topicId/replies/:replyId/vote')
  vote(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string, @Body() dto: VoteDto) { return this.d.vote(u, g, t, r, dto.voteType); }

  @Delete('topics/:topicId/replies/:replyId/vote')
  unvote(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string) { return this.d.removeVote(u, g, t, r); }

  @RequireApproved() @Put('topics/:topicId/replies/:replyId/solution')
  mark(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string) { return this.d.setSolution(u, g, t, r, true); }

  @Delete('topics/:topicId/replies/:replyId/solution')
  unmark(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('topicId', uuid()) t: string, @Param('replyId', uuid()) r: string) { return this.d.setSolution(u, g, t, r, false); }
}

@Controller('study-groups/:groupId')
export class StudyGroupReportsController {
  constructor(private readonly reports: StudyGroupReportsService, private readonly achievements: StudyGroupAchievementsService) {}

  // relatórios (líder / co-líder): rotas estáticas antes de `reports/:reportId`
  @Get('reports') history(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: ListReportsQueryDto) { return this.reports.history(u, g, q); }
  @Get('reports/weekly') weekly(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: WeekQueryDto) { return this.reports.weekly(u, g, q.week); }
  @Get('reports/monthly') monthly(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: MonthQueryDto) { return this.reports.monthly(u, g, q.month); }
  @Get('reports/tasks') tasks(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Query() q: TaskReportQueryDto) { return this.reports.tasks(u, g, q.period); }
  @Get('reports/:reportId') report(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('reportId', uuid()) r: string) { return this.reports.get(u, g, r); }

  // conquistas
  @Get('members/:membershipId/achievements')
  memberAchievements(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string, @Param('membershipId', uuid()) m: string) { return this.achievements.ofMember(u, g, m); }
  @RequireApproved() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('achievements/evaluate')
  evaluate(@CurrentUser() u: AuthUser, @Param('groupId', uuid()) g: string) { return this.achievements.evaluateAsManager(u, g); }
}
