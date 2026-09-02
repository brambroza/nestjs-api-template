import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { ArOutbox, ArOutboxEnvelope } from '../application/ports';

@Injectable()
export class PrismaArOutbox implements ArOutbox {
  constructor(private readonly txm: PrismaTransactionManager) {}
  async enqueue(envelope: ArOutboxEnvelope): Promise<void> {
    const e = envelope.event;
    await this.txm.getClient().outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: e.tenantId,
        aggregateType: e.type.startsWith('receipt')
          ? 'receipt'
          : 'sales_invoice',
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
