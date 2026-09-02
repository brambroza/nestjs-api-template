import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/database';
import type { OutboxStatus } from '../domain/outbox-status';
import type {
  ClaimResult,
  OutboxRow,
  OutboxStore,
} from '../application/ports/outbox-store.port';

/**
 * Read/write side of `outbox_message`. The write side used by
 * production-order (PrismaOutbox in production-order/infrastructure)
 * inserts PENDING rows inside the domain transaction; this store
 * drives dispatch and updates status.
 */
@Injectable()
export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async claimPending(now: Date, limit: number): Promise<ClaimResult> {
    // Read candidates first, then move to IN_FLIGHT with a version-safe
    // updateMany so two workers cannot lease the same row.
    const candidates = await this.prisma.outboxMessage.findMany({
      where: {
        status: 'PENDING',
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        eventType: true,
        aggregateId: true,
        payload: true,
        idempotencyKey: true,
        attempts: true,
        status: true,
      },
    });

    const leased: OutboxRow[] = [];
    for (const c of candidates) {
      const result = await this.prisma.outboxMessage.updateMany({
        where: { id: c.id, status: 'PENDING' },
        data: { status: 'IN_FLIGHT' },
      });
      if (result.count === 1) {
        leased.push({
          id: c.id,
          tenantId: c.tenantId,
          eventType: c.eventType,
          aggregateId: c.aggregateId,
          payload: c.payload,
          idempotencyKey: c.idempotencyKey,
          attempts: c.attempts,
          status: c.status as OutboxStatus,
        });
      }
    }
    return { claimed: leased };
  }

  async markDelivered(id: string, deliveredAt: Date): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        nextAttemptAt: deliveredAt,
        lastError: null,
      },
    });
  }

  async markFailure(
    id: string,
    attemptNumber: number,
    nextAttemptAt: Date | null,
    lastError: string,
  ): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: nextAttemptAt === null ? 'DEAD' : 'PENDING',
        attempts: attemptNumber,
        nextAttemptAt: nextAttemptAt ?? new Date(),
        lastError: lastError.slice(0, 1024),
      },
    });
  }
}
