import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  PurchaseOutbox,
  PurchaseOutboxEnvelope,
} from '../application/ports/outbox.port';

/** ADR 0003 — same outbox_message table the notification worker drains. */
@Injectable()
export class PrismaPurchaseOutbox implements PurchaseOutbox {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async enqueue(envelope: PurchaseOutboxEnvelope): Promise<void> {
    const e = envelope.event;
    await this.txm.getClient().outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: e.tenantId,
        aggregateType: e.type.startsWith('purchase_requisition')
          ? 'purchase_requisition'
          : 'purchase_order',
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
