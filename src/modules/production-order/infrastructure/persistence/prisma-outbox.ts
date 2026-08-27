import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  OutboxEnvelope,
  OutboxPort,
} from '../../application/ports/outbox.port';

type OutboxClient = Pick<Prisma.TransactionClient, 'outboxMessage'>;

/**
 * ADR 0003. Writes a `outbox_message` row inside the current
 * transaction — the same one that changes production_order — so the
 * event never dispatches without the state change and vice versa.
 * The worker (Phase 4d follow-up) reads PENDING rows and delivers.
 */
@Injectable()
export class PrismaOutbox implements OutboxPort {
  constructor(private readonly tx: PrismaTransactionManager) {}

  async enqueue(envelope: OutboxEnvelope): Promise<void> {
    const client = this.tx.getClient() as unknown as OutboxClient;
    const event = envelope.event;
    await client.outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: event.tenantId,
        aggregateType: 'production_order',
        aggregateId: event.aggregateId,
        eventType: event.type,
        payload: JSON.stringify(event, bigintReplacer),
        occurredAt: event.occurredAt,
        status: 'PENDING',
        nextAttemptAt: event.occurredAt,
        idempotencyKey: envelope.idempotencyKey,
      },
    });
  }
}

/** Bigint-safe JSON stringifier. */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}
