import { Inject, Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import { toIsoDate } from '../../../shared/domain';
import {
  JournalSourceType,
  LEDGER_POSTING,
  inventoryMovementLines,
  type KeyedLine,
  type LedgerPostingGateway,
} from '../../finance/ledger';
import { InventoryRefInvalidError } from '../domain';
import type {
  InventoryLedger,
  InventoryPostingBatch,
} from '../application/ports/ledger.port';

/**
 * T-351: every costed stock movement reaches the GL in the posting
 * transaction. The warehouse's branch decides the company. Transfers
 * and reservations produce no lines and therefore no entry.
 */
@Injectable()
export class LedgerInventoryAdapter implements InventoryLedger {
  constructor(
    @Inject(LEDGER_POSTING) private readonly ledger: LedgerPostingGateway,
    private readonly txm: PrismaTransactionManager,
  ) {}

  async movementsPosted(batch: InventoryPostingBatch): Promise<void> {
    const first = batch.movements[0];
    if (!first) return;
    const lines: KeyedLine[] = [];
    for (const m of batch.movements)
      lines.push(
        ...inventoryMovementLines({
          movementType: m.type,
          costMinor: m.costMinor,
        }),
      );
    if (lines.length === 0) return;
    const wh = await this.txm.getClient().warehouse.findFirst({
      where: { id: batch.warehouseId, tenantId: first.tenantId },
      select: { branch: { select: { companyId: true } } },
    });
    if (!wh)
      throw new InventoryRefInvalidError(
        `warehouse ${batch.warehouseId} does not exist`,
      );
    await this.ledger.post({
      companyId: wh.branch.companyId,
      entryDate: toIsoDate(first.occurredAt),
      currency: batch.currency,
      sourceType: JournalSourceType.Inventory,
      sourceId: `${batch.referenceType}:${batch.referenceId}`,
      sourceKey: `inventory:${first.id}`,
      description: `Stock ${first.type} ${batch.referenceType} ${batch.referenceId}`,
      lines,
    });
  }
}
