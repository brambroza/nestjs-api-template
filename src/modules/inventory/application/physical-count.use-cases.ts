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
import { APPROVAL_GATEWAY, type ApprovalGateway } from '../../approval';
import {
  CountApprovalPendingError,
  CountNotFoundError,
  InventoryRefInvalidError,
  InventoryVersionConflictError,
  MovementType,
  StockCount,
  type CountEntry,
  type CountLineInput,
  type CountStatus,
} from '../domain';

import {
  COUNT_REPOSITORY,
  type CountRepository,
} from './ports/count.repository';
import {
  INVENTORY_REF_LOOKUP,
  type InventoryRefLookup,
} from './ports/inventory-ref-lookup.port';
import {
  COST_REPOSITORY,
  STOCK_BALANCE_REPOSITORY,
  type CostRepository,
  type StockBalanceRepository,
} from './ports/repositories';
import { StockLedgerService } from './stock-ledger.service';

export const COUNT_NUMBER_PREFIX = 'CNT';
export const COUNT_DOCUMENT_TYPE = 'STOCK_ADJUSTMENT';
export const COUNT_REFERENCE_TYPE = 'STOCK_COUNT';

export interface CreateCountInput {
  readonly warehouseId: string;
  /** Restrict the sheet to these items (default: everything with a balance row). */
  readonly itemIds?: readonly string[] | null;
  readonly notes?: string | null;
}

/** Freezes the current system quantities of a warehouse into a count sheet. */
@Injectable()
export class CreateCountSheetUseCase {
  constructor(
    @Inject(COUNT_REPOSITORY) private readonly counts: CountRepository,
    @Inject(STOCK_BALANCE_REPOSITORY)
    private readonly balances: StockBalanceRepository,
    @Inject(COST_REPOSITORY) private readonly costs: CostRepository,
    @Inject(INVENTORY_REF_LOOKUP) private readonly refs: InventoryRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateCountInput): Promise<StockCount> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    if (!(await this.refs.warehouseExists(tenantId, input.warehouseId))) {
      throw new InventoryRefInvalidError(
        `warehouse ${input.warehouseId} does not exist or is inactive`,
      );
    }
    const wanted = input.itemIds?.length ? new Set(input.itemIds) : null;
    const page = await this.balances.listByWarehouse(
      tenantId,
      input.warehouseId,
      { limit: 10_000, offset: 0 },
    );
    const lines: CountLineInput[] = [];
    const skuOf = new Map<string, string>();
    const costOf = new Map<string, bigint>();
    for (const row of page.items) {
      const b = row.balance;
      if (wanted && !wanted.has(b.itemId)) continue;
      if (!skuOf.has(b.itemId)) {
        const item = await this.refs.findItem(tenantId, b.itemId);
        skuOf.set(b.itemId, item?.sku ?? b.itemId);
        costOf.set(
          b.itemId,
          (await this.costs.findAverage(tenantId, b.itemId))?.unitCostMinor ??
            0n,
        );
      }
      lines.push({
        id: randomUUID(),
        itemId: b.itemId,
        itemSku: skuOf.get(b.itemId) ?? b.itemId,
        lotId: b.lotId,
        lotNumber: row.lotNumber,
        uomCode: b.uomCode,
        systemQty: b.onHandQty,
        unitCostMinor: costOf.get(b.itemId) ?? 0n,
      });
    }
    return this.tx.runInTransaction(async () => {
      const c = StockCount.create({
        id: randomUUID(),
        tenantId,
        number: await this.numbers.next(tenantId, COUNT_NUMBER_PREFIX, now),
        warehouseId: input.warehouseId,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.counts.create(c);
      return c;
    });
  }
}

export interface CountActionInput {
  readonly countId: string;
  readonly expectedVersion?: number | null;
}

function assertVersion(
  c: StockCount,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== c.version) {
    throw new InventoryVersionConflictError(c.id, expected, c.version);
  }
}

abstract class CountAction {
  constructor(
    protected readonly counts: CountRepository,
    protected readonly tx: TransactionManager,
    protected readonly tenant: TenantContext,
    protected readonly clock: Clock,
  ) {}

  protected async load(input: CountActionInput): Promise<StockCount> {
    const c = await this.counts.findById(
      this.tenant.getTenantId(),
      input.countId,
    );
    if (!c) throw new CountNotFoundError(input.countId);
    assertVersion(c, input.expectedVersion);
    return c;
  }
}

@Injectable()
export class StartCountUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(counts, tx, tenant, clock);
  }
  async execute(input: CountActionInput): Promise<StockCount> {
    return this.tx.runInTransaction(async () =>
      this.counts.save((await this.load(input)).start(this.clock.now())),
    );
  }
}

@Injectable()
export class RecordCountsUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(counts, tx, tenant, clock);
  }
  async execute(
    input: CountActionInput & { readonly entries: readonly CountEntry[] },
  ): Promise<StockCount> {
    return this.tx.runInTransaction(async () =>
      this.counts.save(
        (await this.load(input)).recordCounts(input.entries, this.clock.now()),
      ),
    );
  }
}

@Injectable()
export class RecountUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(counts, tx, tenant, clock);
  }
  async execute(input: CountActionInput): Promise<StockCount> {
    return this.tx.runInTransaction(async () =>
      this.counts.save((await this.load(input)).recount(this.clock.now())),
    );
  }
}

@Injectable()
export class CancelCountUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(counts, tx, tenant, clock);
  }
  async execute(input: CountActionInput): Promise<StockCount> {
    return this.tx.runInTransaction(async () =>
      this.counts.save((await this.load(input)).cancel(this.clock.now())),
    );
  }
}

/** Posts every non-zero variance as ADJUST_IN / ADJUST_OUT through the ledger. */
async function postAdjustments(
  ledger: StockLedgerService,
  c: StockCount,
): Promise<void> {
  const s = c.snapshot();
  for (const l of s.lines) {
    if (l.varianceQty === 0n) continue;
    const isIn = l.varianceQty > 0n;
    await ledger.post({
      warehouseId: s.warehouseId,
      type: isIn ? MovementType.AdjustIn : MovementType.AdjustOut,
      currency: 'THB',
      referenceType: COUNT_REFERENCE_TYPE,
      referenceId: s.id,
      reason: `Physical count ${s.number}`,
      lines: [
        {
          itemId: l.itemId,
          quantity: isIn ? l.varianceQty : -l.varianceQty,
          uomCode: l.uomCode,
          unitCostMinor: isIn ? l.unitCostMinor : null,
          lotNumber: l.lotNumber,
        },
      ],
      consumeReservations: false,
    });
  }
}

/**
 * COUNTING → REVIEW. Variances open a STOCK_ADJUSTMENT approval on their
 * absolute value; no variance (or auto-approval) posts at once.
 */
@Injectable()
export class SubmitCountUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    private readonly ledger: StockLedgerService,
  ) {
    super(counts, tx, tenant, clock);
  }

  async execute(input: CountActionInput): Promise<StockCount> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const review = (await this.load(input)).submitForReview(now);
      if (!review.hasVariance) {
        return this.counts.save(review.post(now));
      }
      const outcome = await this.approvals.submit({
        documentType: COUNT_DOCUMENT_TYPE,
        documentId: review.id,
        amountMinor: review.varianceValueMinor,
        currency: 'THB',
      });
      const withApproval = review.withApproval(outcome.requestId, now);
      if (outcome.status === 'APPROVED') {
        await postAdjustments(this.ledger, withApproval);
        return this.counts.save(withApproval.post(now));
      }
      return this.counts.save(withApproval);
    });
  }
}

/** REVIEW → POSTED once the adjustment approval is APPROVED (pull model); REJECTED → recount. */
@Injectable()
export class PostCountUseCase extends CountAction {
  constructor(
    @Inject(COUNT_REPOSITORY) counts: CountRepository,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    private readonly ledger: StockLedgerService,
  ) {
    super(counts, tx, tenant, clock);
  }

  async execute(input: CountActionInput): Promise<StockCount> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const c = await this.load(input);
      const state = await this.approvals.stateOf(COUNT_DOCUMENT_TYPE, c.id);
      switch (state.status) {
        case 'APPROVED':
        case 'NONE':
          await postAdjustments(this.ledger, c);
          return this.counts.save(c.post(now));
        case 'REJECTED':
        case 'CANCELLED':
          return this.counts.save(c.recount(now));
        case 'PENDING':
          throw new CountApprovalPendingError(c.id, state.requestId);
      }
    });
  }
}

@Injectable()
export class GetCountUseCase {
  constructor(
    @Inject(COUNT_REPOSITORY) private readonly counts: CountRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<StockCount> {
    const c = await this.counts.findById(this.tenant.getTenantId(), id);
    if (!c) throw new CountNotFoundError(id);
    return c;
  }
}

@Injectable()
export class ListCountsUseCase {
  constructor(
    @Inject(COUNT_REPOSITORY) private readonly counts: CountRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    input: {
      warehouseId?: string | null;
      status?: CountStatus | null;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.counts.list(this.tenant.getTenantId(), {
      warehouseId: input.warehouseId ?? null,
      status: input.status ?? null,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}
