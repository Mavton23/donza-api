import { Module } from '@nestjs/common';
import { StudyGroupAchievementsService } from './study-group-achievements.service';
import { StudyGroupReportsService } from './study-group-reports.service';
import { StudyGroupContentsService } from './study-group-contents.service';
import { StudyGroupDiscussionsService } from './study-group-discussions.service';
import { StudyGroupMeetingsService } from './study-group-meetings.service';
import { StudyGroupMembersService } from './study-group-members.service';
import { StudyGroupTasksService } from './study-group-tasks.service';
import { StudyGroupContentsController, StudyGroupDiscussionsController, StudyGroupReportsController, StudyGroupTasksController } from './study-group-work.controllers';
import { ModerationController } from './moderation/moderation.controller';
import { ModerationService } from './moderation/moderation.service';
import { StudyGroupsController } from './study-groups.controller';
import { StudyGroupsService } from './study-groups.service';

@Module({
  controllers: [StudyGroupsController, StudyGroupTasksController, StudyGroupContentsController, StudyGroupDiscussionsController, StudyGroupReportsController, ModerationController],
  providers: [ModerationService, StudyGroupReportsService, StudyGroupAchievementsService, StudyGroupsService, StudyGroupMembersService, StudyGroupMeetingsService, StudyGroupTasksService, StudyGroupContentsService, StudyGroupDiscussionsService],
  // O módulo de mensagens do grupo reutiliza estes serviços.
  exports: [StudyGroupsService, StudyGroupMembersService, StudyGroupReportsService, StudyGroupAchievementsService],
})
export class StudyGroupsModule {}
