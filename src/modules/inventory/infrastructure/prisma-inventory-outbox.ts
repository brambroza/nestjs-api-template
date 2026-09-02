import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import type {
  InventoryOutbox,
  InventoryOutboxEnvelope,
} from '../application/ports/outbox.port';

/** ADR 0003 — same outbox_message table the notification worker drains. */
@Injectable()
export class PrismaInventoryOutbox implements InventoryOutbox {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async enqueue(envelope: InventoryOutboxEnvelope): Promise<void> {
    const e = envelope.event;
    await this.txm.getClient().outboxMessage.create({
      data: {
        id: randomUUID(),
        tenantId: e.tenantId,
        aggregateType: e.type.startsWith('inventory.lot')
          ? 'lot'
          : e.type.startsWith('inventory.transfer')
            ? 'stock_transfer'
            : 'stock_movement',
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
