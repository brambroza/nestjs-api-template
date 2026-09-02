import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import {
  DOCUMENT_NUMBER_GENERATOR,
  type DocumentNumberGenerator,
} from '../../../shared/sequence';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../shared/transaction';
import {
  InventoryRefInvalidError,
  InventoryVersionConflictError,
  MovementType,
  StockTransfer,
  TransferNotFoundError,
  type TransferLineInput,
  type TransferStatus,
} from '../domain';

import {
  INVENTORY_REF_LOOKUP,
  type InventoryRefLookup,
} from './ports/inventory-ref-lookup.port';
import { INVENTORY_OUTBOX, type InventoryOutbox } from './ports/outbox.port';
import {
  LOT_REPOSITORY,
  TRANSFER_REPOSITORY,
  type LotRepository,
  type TransferRepository,
} from './ports/repositories';
import { StockLedgerService } from './stock-ledger.service';

export const TRANSFER_NUMBER_PREFIX = 'TR';
export const TRANSFER_REFERENCE_TYPE = 'STOCK_TRANSFER';

export interface TransferLineRequest {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly lotNumber?: string | null;
  readonly serialNumbers?: readonly string[] | null;
}

export interface CreateTransferInput {
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly notes?: string | null;
  readonly lines: readonly TransferLineRequest[];
}

@Injectable()
export class CreateTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    @Inject(INVENTORY_REF_LOOKUP) private readonly refs: InventoryRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateTransferInput): Promise<StockTransfer> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    for (const w of [input.fromWarehouseId, input.toWarehouseId]) {
      if (!(await this.refs.warehouseExists(tenantId, w))) {
        throw new InventoryRefInvalidError(
          `warehouse ${w} does not exist or is inactive`,
        );
      }
    }
    const lines: TransferLineInput[] = [];
    for (const l of input.lines) {
      const item = await this.refs.findItem(tenantId, l.itemId);
      if (!item?.isActive)
        throw new InventoryRefInvalidError(
          `item ${l.itemId} does not exist or is inactive`,
        );
      const lotNumber = (l.lotNumber ?? '').trim().toUpperCase();
      const lot = lotNumber
        ? await this.lots.findByNumber(tenantId, item.id, lotNumber)
        : null;
      if (lotNumber && !lot)
        throw new InventoryRefInvalidError(
          `lot ${lotNumber} of ${item.sku} does not exist`,
        );
      lines.push({
        id: randomUUID(),
        itemId: item.id,
        itemSku: item.sku,
        lotId: lot?.id ?? null,
        uomCode: item.defaultUomCode,
        quantity: l.quantity,
        serialNumbers: (l.serialNumbers ?? []).map((s) =>
          s.trim().toUpperCase(),
        ),
      });
    }
    return this.tx.runInTransaction(async () => {
      const t = StockTransfer.create({
        id: randomUUID(),
        tenantId,
        number: await this.numbers.next(tenantId, TRANSFER_NUMBER_PREFIX, now),
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(t);
      return t;
    });
  }
}

export interface TransferActionInput {
  readonly transferId: string;
  readonly expectedVersion?: number | null;
}

function assertVersion(
  t: StockTransfer,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== t.version) {
    throw new InventoryVersionConflictError(t.id, expected, t.version);
  }
}

/** TRANSFER_OUT at the source; the carried unit cost is what FIFO/average charged. */
@Injectable()
export class ShipTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    private readonly ledger: StockLedgerService,
    @Inject(INVENTORY_OUTBOX) private readonly outbox: InventoryOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: TransferActionInput): Promise<StockTransfer> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const t = await this.repo.findById(tenantId, input.transferId);
      if (!t) throw new TransferNotFoundError(input.transferId);
      assertVersion(t, input.expectedVersion);
      const s = t.snapshot();
      const unitCosts = new Map<string, bigint>();
      for (const line of s.lines) {
        const lot = line.lotId
          ? await this.lots.findById(tenantId, line.lotId)
          : null;
        const posted = await this.ledger.post({
          warehouseId: s.fromWarehouseId,
          type: MovementType.TransferOut,
          currency: 'THB',
          referenceType: TRANSFER_REFERENCE_TYPE,
          referenceId: s.id,
          lines: [
            {
              itemId: line.itemId,
              quantity: line.quantity,
              uomCode: line.uomCode,
              lotNumber: lot?.lotNumber ?? null,
              serialNumbers: line.serialNumbers,
            },
          ],
          consumeReservations: false,
        });
        const cost = posted.reduce((sum, m) => sum + m.costMinor, 0n);
        unitCosts.set(
          line.id,
          line.quantity === 0n ? 0n : cost / line.quantity,
        );
      }
      const shipped = await this.repo.save(t.ship(unitCosts, now));
      await this.outbox.enqueue({
        idempotencyKey: `${shipped.id}:shipped`,
        event: {
          type: 'inventory.transfer_shipped.v1',
          aggregateId: shipped.id,
          tenantId,
          occurredAt: now,
          number: s.number,
          fromWarehouseId: s.fromWarehouseId,
          toWarehouseId: s.toWarehouseId,
          actor: this.tenant.getUserId(),
        },
      });
      return shipped;
    });
  }
}

/** TRANSFER_IN at the destination at the carried cost (same lot numbers, same serials). */
@Injectable()
export class ReceiveTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    private readonly ledger: StockLedgerService,
    @Inject(INVENTORY_OUTBOX) private readonly outbox: InventoryOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: TransferActionInput): Promise<StockTransfer> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const t = await this.repo.findById(tenantId, input.transferId);
      if (!t) throw new TransferNotFoundError(input.transferId);
      assertVersion(t, input.expectedVersion);
      const received = t.receive(now);
      const s = t.snapshot();
      for (const line of s.lines) {
        const lot = line.lotId
          ? await this.lots.findById(tenantId, line.lotId)
          : null;
        await this.ledger.post({
          warehouseId: s.toWarehouseId,
          type: MovementType.TransferIn,
          currency: 'THB',
          referenceType: TRANSFER_REFERENCE_TYPE,
          referenceId: s.id,
          lines: [
            {
              itemId: line.itemId,
              quantity: line.quantity,
              uomCode: line.uomCode,
              unitCostMinor: line.unitCostMinor,
              lotNumber: lot?.lotNumber ?? null,
              expiryDate: lot?.expiryDate ?? null,
              serialNumbers: line.serialNumbers,
            },
          ],
        });
      }
      const saved = await this.repo.save(received);
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:received`,
        event: {
          type: 'inventory.transfer_received.v1',
          aggregateId: saved.id,
          tenantId,
          occurredAt: now,
          number: s.number,
          fromWarehouseId: s.fromWarehouseId,
          toWarehouseId: s.toWarehouseId,
          actor: this.tenant.getUserId(),
        },
      });
      return saved;
    });
  }
}

@Injectable()
export class CancelTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: TransferActionInput): Promise<StockTransfer> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const t = await this.repo.findById(tenantId, input.transferId);
      if (!t) throw new TransferNotFoundError(input.transferId);
      assertVersion(t, input.expectedVersion);
      return this.repo.save(t.cancel(this.clock.now()));
    });
  }
}

@Injectable()
export class GetTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<StockTransfer> {
    const t = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!t) throw new TransferNotFoundError(id);
    return t;
  }
}

@Injectable()
export class ListTransfersUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: {
      status?: TransferStatus | null;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.repo.list(this.tenant.getTenantId(), {
      status: input.status ?? null,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}
