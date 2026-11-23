import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({ imports: [CoursesModule], controllers: [LibraryController], providers: [LibraryService] })
export class LibraryModule {}
