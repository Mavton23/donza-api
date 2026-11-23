import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserStatusGuard } from './common/guards/user-status.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { LastActiveInterceptor } from './common/interceptors/last-active.interceptor';
import { validateEnv } from './common/config/env.validation';
import { CoursesModule } from './modules/courses/courses.module';
import { EventsModule } from './modules/events/events.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { StudyGroupsModule } from './modules/study-groups/study-groups.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { HelpModule } from './modules/help/help.module';
import { ContactModule } from './modules/contact/contact.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AdminModule } from './modules/admin/admin.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LibraryModule } from './modules/library/library.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { HealthModule } from './modules/health/health.module';
import { SearchModule } from './modules/search/search.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ActivityModule } from './modules/activity/activity.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    StorageModule,
    MailModule,
    NotificationsModule,
    ReviewsModule,
    TestimonialsModule,
    HelpModule,
    ContactModule,
    AssignmentsModule,
    CertificatesModule,
    SchedulerModule,
    AdminModule,
    InstitutionsModule,
    DashboardModule,
    SearchModule,
    PaymentsModule,
    LibraryModule,
    CalendarModule,
    HealthModule,
    ActivityModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    EventsModule,
    CommunitiesModule,
    StudyGroupsModule,
    MessagesModule,
    RealtimeModule,
  ],
  providers: [
    // A ordem importa: limitar -> autenticar -> role -> status
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: UserStatusGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LastActiveInterceptor },
  ],
})
export class AppModule {}
