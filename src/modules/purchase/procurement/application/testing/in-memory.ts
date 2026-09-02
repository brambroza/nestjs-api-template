import type { Clock } from '../../../../../shared/clock';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import type {
  ApprovalGateway,
  ApprovalOutcome,
  ApprovalStateView,
  ApprovalSubmitInput,
} from '../../../../approval';
import {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseRequisition,
  PurchaseVersionConflictError,
} from '../../domain';
import type { GoodsReceiptRepository } from '../ports/goods-receipt.repository';
import type {
  PurchaseOutbox,
  PurchaseOutboxEnvelope,
} from '../ports/outbox.port';
import type {
  ListPurchaseOrdersFilter,
  ListPurchaseOrdersPage,
  PurchaseOrderRepository,
} from '../ports/purchase-order.repository';
import type {
  CompanyRef,
  ItemRef,
  PurchaseRefLookup,
  VendorRef,
} from '../ports/purchase-ref-lookup.port';
import type { PurchaseTax, VatLookupResult } from '../ports/purchase-tax.port';
import type {
  ListRequisitionsFilter,
  ListRequisitionsPage,
  RequisitionRepository,
} from '../ports/requisition.repository';

interface Versioned {
  readonly id: string;
  readonly version: number;
}

class VersionedStore<T extends Versioned> {
  readonly rows = new Map<string, T>();
  constructor(private readonly bump: (t: T) => T) {}
  get(id: string): T | null {
    return this.rows.get(id) ?? null;
  }
  put(t: T): void {
    this.rows.set(t.id, t);
  }
  save(t: T): T {
    const stored = this.rows.get(t.id);
    if (!stored || stored.version !== t.version) {
      throw new PurchaseVersionConflictError(
        t.id,
        t.version,
        stored?.version ?? -1,
      );
    }
    const next = this.bump(t);
    this.rows.set(t.id, next);
    return next;
  }
}

export class InMemoryRequisitionRepository implements RequisitionRepository {
  readonly store = new VersionedStore<PurchaseRequisition>((p) =>
    PurchaseRequisition.fromSnapshot({
      ...p.snapshot(),
      version: p.version + 1,
    }),
  );
  async findById(
    tenantId: string,
    id: string,
  ): Promise<PurchaseRequisition | null> {
    const p = this.store.get(id);
    return p && p.snapshot().tenantId === tenantId ? p : null;
  }
  async list(
    tenantId: string,
    f: ListRequisitionsFilter,
  ): Promise<ListRequisitionsPage> {
    const all = [...this.store.rows.values()].filter((p) => {
      const s = p.snapshot();
      return (
        s.tenantId === tenantId &&
        (!f.status || s.status === f.status) &&
        (!f.requesterId || s.requesterId === f.requesterId)
      );
    });
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(p: PurchaseRequisition): Promise<void> {
    this.store.put(p);
  }
  async save(p: PurchaseRequisition): Promise<PurchaseRequisition> {
    return this.store.save(p);
  }
}

export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  readonly store = new VersionedStore<PurchaseOrder>((p) =>
    PurchaseOrder.fromSnapshot({ ...p.snapshot(), version: p.version + 1 }),
  );
  async findById(tenantId: string, id: string): Promise<PurchaseOrder | null> {
    const p = this.store.get(id);
    return p && p.snapshot().tenantId === tenantId ? p : null;
  }
  async list(
    tenantId: string,
    f: ListPurchaseOrdersFilter,
  ): Promise<ListPurchaseOrdersPage> {
    const all = [...this.store.rows.values()].filter((p) => {
      const s = p.snapshot();
      return (
        s.tenantId === tenantId &&
        (!f.status || s.status === f.status) &&
        (!f.vendorId || s.vendorId === f.vendorId)
      );
    });
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(p: PurchaseOrder): Promise<void> {
    this.store.put(p);
  }
  async save(p: PurchaseOrder): Promise<PurchaseOrder> {
    return this.store.save(p);
  }
}

export class InMemoryGoodsReceiptRepository implements GoodsReceiptRepository {
  readonly store = new VersionedStore<GoodsReceipt>((g) =>
    GoodsReceipt.fromSnapshot({ ...g.snapshot(), version: g.version + 1 }),
  );
  async findById(tenantId: string, id: string): Promise<GoodsReceipt | null> {
    const g = this.store.get(id);
    return g && g.snapshot().tenantId === tenantId ? g : null;
  }
  async listForOrder(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<readonly GoodsReceipt[]> {
    return [...this.store.rows.values()].filter(
      (g) =>
        g.snapshot().tenantId === tenantId &&
        g.snapshot().purchaseOrderId === purchaseOrderId,
    );
  }
  async create(g: GoodsReceipt): Promise<void> {
    this.store.put(g);
  }
  async save(g: GoodsReceipt): Promise<GoodsReceipt> {
    return this.store.save(g);
  }
}

export class InMemoryPurchaseRefLookup implements PurchaseRefLookup {
  readonly companies = new Map<string, CompanyRef>();
  readonly vendors = new Map<string, VendorRef>();
  readonly items = new Map<string, ItemRef>();
  readonly currencies = new Set<string>(['THB', 'USD']);
  readonly warehouses = new Set<string>(['wh-main']);
  async findCompany(_t: string, id: string): Promise<CompanyRef | null> {
    return this.companies.get(id) ?? null;
  }
  async findVendor(_t: string, id: string): Promise<VendorRef | null> {
    return this.vendors.get(id) ?? null;
  }
  async findItem(_t: string, id: string): Promise<ItemRef | null> {
    return this.items.get(id) ?? null;
  }
  async currencyExists(_t: string, code: string): Promise<boolean> {
    return this.currencies.has(code);
  }
  async warehouseExists(_t: string, id: string): Promise<boolean> {
    return this.warehouses.has(id);
  }
}

export class InMemoryPurchaseTax implements PurchaseTax {
  vat: VatLookupResult = {
    taxCodeId: 'tax-vat7',
    taxCode: 'VAT7',
    rateBasisPoints: 700,
  };
  async resolveVat(): Promise<VatLookupResult> {
    return this.vat;
  }
}

export class InMemoryPurchaseOutbox implements PurchaseOutbox {
  readonly rows: PurchaseOutboxEnvelope[] = [];
  async enqueue(envelope: PurchaseOutboxEnvelope): Promise<void> {
    this.rows.push(envelope);
  }
}

export class FakeApprovalGateway implements ApprovalGateway {
  nextOutcome: ApprovalOutcome['status'] = 'APPROVED';
  readonly states = new Map<string, ApprovalStateView>();
  readonly submitted: ApprovalSubmitInput[] = [];
  private n = 0;
  async submit(input: ApprovalSubmitInput): Promise<ApprovalOutcome> {
    this.submitted.push(input);
    this.n += 1;
    const requestId = `apr-${String(this.n)}`;
    this.states.set(input.documentId, { status: this.nextOutcome, requestId });
    return { requestId, status: this.nextOutcome };
  }
  async stateOf(_type: string, documentId: string): Promise<ApprovalStateView> {
    return this.states.get(documentId) ?? { status: 'NONE', requestId: null };
  }
}

export class FakeNumbers implements DocumentNumberGenerator {
  private readonly counters = new Map<string, number>();
  async next(_t: string, prefix: string): Promise<string> {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-202609-${String(n).padStart(4, '0')}`;
  }
}

export class FakeTx implements TransactionManager {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return this.current;
  }
}

export function tenantOf(tenantId: string, userId: string): TenantContext {
  return {
    getTenantId: () => tenantId,
    getUserId: () => userId,
    tryGetUserId: () => userId,
  };
}
