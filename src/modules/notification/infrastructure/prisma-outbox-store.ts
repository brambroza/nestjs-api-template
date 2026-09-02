import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/database';
import type { OutboxStatus } from '../domain/outbox-status';
import type {
  ClaimResult,
  OutboxRow,
  OutboxStore,
} from '../application/ports/outbox-store.port';

/**
 * Read/write side of `outbox_message`. Write path is owned by
 * production-order's PrismaOutbox (rows land inside the domain tx);
 * this store leases them, records terminal state, and reclaims rows
 * stuck IN_FLIGHT after a worker crash (ADR 0003 §2.3).
 */
@Injectable()
export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async claimPending(now: Date, limit: number): Promise<ClaimResult> {
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
        aggregateType: true,
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
        data: { status: 'IN_FLIGHT', leasedAt: now },
      });
      if (result.count === 1) {
        leased.push({
          id: c.id,
          tenantId: c.tenantId,
          eventType: c.eventType,
          aggregateType: c.aggregateType,
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
        leasedAt: null,
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
        leasedAt: null,
        lastError: lastError.slice(0, 1024),
      },
    });
  }

  async reclaimStalled(staleBefore: Date): Promise<number> {
    const result = await this.prisma.outboxMessage.updateMany({
      where: {
        status: 'IN_FLIGHT',
        leasedAt: { lt: staleBefore },
      },
      data: {
        status: 'PENDING',
        leasedAt: null,
      },
    });
    return result.count;
  }
}
