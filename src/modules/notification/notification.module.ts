import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { OutboxDispatcher } from './application/outbox-dispatcher.service';
import { LINE_MESSAGING } from './application/ports/line-messaging.port';
import { OUTBOX_STORE } from './application/ports/outbox-store.port';
import { LineMessagingAdapter } from './infrastructure/line-messaging.adapter';
import { OutboxWorkerCron } from './infrastructure/outbox-worker.cron';
import { PrismaOutboxStore } from './infrastructure/prisma-outbox-store';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    { provide: OUTBOX_STORE, useClass: PrismaOutboxStore },
    { provide: LINE_MESSAGING, useClass: LineMessagingAdapter },
    OutboxDispatcher,
    OutboxWorkerCron,
  ],
  exports: [OutboxDispatcher],
})
export class NotificationModule {}
