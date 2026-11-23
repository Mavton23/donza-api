import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  // Usado pelo futuro módulo de pagamentos (register com allowPaid).
  exports: [EventsService],
})
export class EventsModule {}
