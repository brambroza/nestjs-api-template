import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  QuotationOutbox,
  QuotationOutboxEnvelope,
} from '../application/ports/outbox.port';

/** ADR 0003 — same outbox_message table the notification worker drains. */
@Injectable()
export class PrismaQuotationOutbox implements QuotationOutbox {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async enqueue(envelope: QuotationOutboxEnvelope): Promise<void> {
    const e = envelope.event;
    await this.txm.getClient().outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: e.tenantId,
        aggregateType: 'quotation',
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
