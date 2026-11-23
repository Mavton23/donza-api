import { Module } from '@nestjs/common';
import { StudyGroupsModule } from '../study-groups/study-groups.module';
import { SchedulerService } from './scheduler.service';

@Module({ imports: [StudyGroupsModule], providers: [SchedulerService], exports: [SchedulerService] })
export class SchedulerModule {}
