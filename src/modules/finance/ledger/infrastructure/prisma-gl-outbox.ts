import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { GlOutbox, GlOutboxEnvelope } from '../application/ports';

@Injectable()
export class PrismaGlOutbox implements GlOutbox {
  constructor(private readonly txm: PrismaTransactionManager) {}
  async enqueue(envelope: GlOutboxEnvelope): Promise<void> {
    const e = envelope.event;
    await this.txm.getClient().outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: e.tenantId,
        aggregateType: 'journal_entry',
        aggregateId: e.aggregateId,
        eventType: e.type,
        payload: JSON.stringify(e, (_k, v: unknown) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
        occurredAt: e.occurredAt,
        status: 'PENDING',
        nextAttemptAt: e.occurredAt,
        idempotencyKey: envelope.idempotencyKey,
      },
    });
  }
}
