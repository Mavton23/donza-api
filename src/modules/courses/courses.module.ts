import { Module } from '@nestjs/common';
import { CourseContentController } from './course-content.controller';
import { CourseContentService } from './course-content.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  // Ordem dos controllers = ordem de registo das rotas (estáticas antes de `courses/:idOrSlug`).
  controllers: [CoursesController, EnrollmentsController, CourseContentController],
  providers: [CoursesService, EnrollmentsService, CourseContentService],
  // EnrollmentsService é usado pelo futuro módulo de pagamentos (enroll com allowPaid).
  exports: [EnrollmentsService],
})
export class CoursesModule {}
