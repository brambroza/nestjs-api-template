import type { Clock } from '../../../../../shared/clock';
import type { IsoDate } from '../../../../../shared/domain';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import {
  ApPostingPeriodClosedError,
  ApVersionConflictError,
  PaymentBatch,
  PaymentVoucher,
  VendorInvoice,
  type WhtCertificateSnapshot,
} from '../../domain';
import type {
  ApLedger,
  ApOutbox,
  ApOutboxEnvelope,
  ApPostingGate,
  ApRefLookup,
  ApTax,
  CompanyRef,
  ItemRef,
  PaymentBatchRepository,
  PaymentVoucherRepository,
  PurchaseOrderForMatching,
  VendorInvoiceFilter,
  VendorInvoiceRepository,
  VendorRef,
  VoucherFilter,
  WhtCertificateRepository,
  WhtCodeRef,
} from '../ports';

export class InMemoryVendorInvoices implements VendorInvoiceRepository {
  readonly rows = new Map<string, VendorInvoice>();
  async findById(t: string, id: string) {
    const i = this.rows.get(id);
    return i && i.snapshot().tenantId === t ? i : null;
  }
  async list(t: string, f: VendorInvoiceFilter) {
    const all = [...this.rows.values()].filter(
      (i) =>
        i.snapshot().tenantId === t &&
        (!f.status || i.status === f.status) &&
        (!f.vendorId || i.snapshot().vendorId === f.vendorId),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async listOpen(
    t: string,
    vendorId: string | null,
    dueOnOrBefore: IsoDate | null,
  ) {
    return [...this.rows.values()]
      .filter(
        (i) =>
          i.snapshot().tenantId === t &&
          i.isOpen &&
          (!vendorId || i.snapshot().vendorId === vendorId) &&
          (!dueOnOrBefore || i.snapshot().dueDate <= dueOnOrBefore),
      )
      .sort((a, b) => (a.snapshot().dueDate < b.snapshot().dueDate ? -1 : 1));
  }
  async invoicedQtyByPurchaseOrderLine(t: string, purchaseOrderId: string) {
    const m = new Map<string, bigint>();
    for (const i of this.rows.values()) {
      const s = i.snapshot();
      if (
        s.tenantId !== t ||
        s.purchaseOrderId !== purchaseOrderId ||
        s.status === 'VOID'
      )
        continue;
      for (const l of s.lines)
        if (l.purchaseOrderLineId)
          m.set(
            l.purchaseOrderLineId,
            (m.get(l.purchaseOrderLineId) ?? 0n) + l.quantity,
          );
    }
    return m;
  }
  async create(i: VendorInvoice) {
    this.rows.set(i.id, i);
  }
  async save(i: VendorInvoice) {
    const stored = this.rows.get(i.id);
    if (!stored || stored.version !== i.version)
      throw new ApVersionConflictError(i.id, i.version, stored?.version ?? -1);
    const next = VendorInvoice.fromSnapshot({
      ...i.snapshot(),
      version: i.version + 1,
    });
    this.rows.set(i.id, next);
    return next;
  }
}

export class InMemoryVouchers implements PaymentVoucherRepository {
  readonly rows = new Map<string, PaymentVoucher>();
  async findById(t: string, id: string) {
    const v = this.rows.get(id);
    return v && v.snapshot().tenantId === t ? v : null;
  }
  async findMany(t: string, ids: readonly string[]) {
    return ids
      .map((id) => this.rows.get(id))
      .filter((v): v is PaymentVoucher => !!v && v.snapshot().tenantId === t);
  }
  async listForBatch(t: string, batchId: string) {
    return [...this.rows.values()].filter(
      (v) => v.snapshot().tenantId === t && v.snapshot().batchId === batchId,
    );
  }
  async list(t: string, f: VoucherFilter) {
    const all = [...this.rows.values()].filter(
      (v) =>
        v.snapshot().tenantId === t &&
        (!f.status || v.status === f.status) &&
        (!f.vendorId || v.snapshot().vendorId === f.vendorId),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(v: PaymentVoucher) {
    this.rows.set(v.id, v);
  }
  async save(v: PaymentVoucher) {
    const stored = this.rows.get(v.id);
    if (!stored || stored.version !== v.version)
      throw new ApVersionConflictError(v.id, v.version, stored?.version ?? -1);
    const next = PaymentVoucher.fromSnapshot({
      ...v.snapshot(),
      version: v.version + 1,
    });
    this.rows.set(v.id, next);
    return next;
  }
}

export class InMemoryBatches implements PaymentBatchRepository {
  readonly rows = new Map<string, PaymentBatch>();
  async findById(t: string, id: string) {
    const b = this.rows.get(id);
    return b && b.snapshot().tenantId === t ? b : null;
  }
  async list(
    t: string,
    f: { status?: string | null; limit: number; offset: number },
  ) {
    const all = [...this.rows.values()].filter(
      (b) =>
        b.snapshot().tenantId === t &&
        (!f.status || b.snapshot().status === f.status),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(b: PaymentBatch) {
    this.rows.set(b.id, b);
  }
  async save(b: PaymentBatch) {
    const stored = this.rows.get(b.id);
    if (!stored || stored.version !== b.version)
      throw new ApVersionConflictError(b.id, b.version, stored?.version ?? -1);
    const next = PaymentBatch.fromSnapshot({
      ...b.snapshot(),
      version: b.version + 1,
    });
    this.rows.set(b.id, next);
    return next;
  }
}

export class InMemoryCertificates implements WhtCertificateRepository {
  readonly rows = new Map<string, WhtCertificateSnapshot>();
  async findById(t: string, id: string) {
    const c = this.rows.get(id);
    return c && c.tenantId === t ? c : null;
  }
  async findByVoucher(t: string, voucherId: string) {
    return (
      [...this.rows.values()].find(
        (c) => c.tenantId === t && c.voucherId === voucherId,
      ) ?? null
    );
  }
  async list(
    t: string,
    f: { vendorId?: string | null; limit: number; offset: number },
  ) {
    const all = [...this.rows.values()].filter(
      (c) => c.tenantId === t && (!f.vendorId || c.vendorId === f.vendorId),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(c: WhtCertificateSnapshot) {
    this.rows.set(c.id, c);
  }
  async markVoid(_t: string, id: string) {
    const c = this.rows.get(id);
    if (c) this.rows.set(id, { ...c, isVoid: true });
  }
}

export class InMemoryApRefLookup implements ApRefLookup {
  readonly companies = new Map<string, CompanyRef>();
  readonly vendors = new Map<string, VendorRef>();
  readonly items = new Map<string, ItemRef>();
  readonly orders = new Map<string, PurchaseOrderForMatching>();
  async findCompany(_t: string, id: string) {
    return this.companies.get(id) ?? null;
  }
  async findVendor(_t: string, id: string) {
    return this.vendors.get(id) ?? null;
  }
  async findItem(_t: string, id: string) {
    return this.items.get(id) ?? null;
  }
  async findPurchaseOrderForMatching(_t: string, id: string) {
    return this.orders.get(id) ?? null;
  }
}

export class FakeApTax implements ApTax {
  readonly whtCodes = new Map<string, WhtCodeRef>([
    [
      'tax-wht3',
      {
        id: 'tax-wht3',
        code: 'WHT3',
        rateBasisPoints: 300,
        pndForm: 'PND53',
        incomeType: 'ค่าบริการ',
      },
    ],
  ]);
  async resolveVat() {
    return { taxCodeId: 'tax-vat7', taxCode: 'VAT7', rateBasisPoints: 700 };
  }
  async findWhtCode(id: string) {
    return this.whtCodes.get(id) ?? null;
  }
}

export class FakePostingGate implements ApPostingGate {
  closedBefore: IsoDate | null = null;
  async assertOpen(companyId: string, date: IsoDate) {
    if (this.closedBefore && date < this.closedBefore)
      throw new ApPostingPeriodClosedError(companyId, date, 'PERIOD_LOCKED');
  }
}

export class InMemoryApOutbox implements ApOutbox {
  readonly rows: ApOutboxEnvelope[] = [];
  async enqueue(e: ApOutboxEnvelope) {
    this.rows.push(e);
  }
}

export class FakeNumbers implements DocumentNumberGenerator {
  private readonly counters = new Map<string, number>();
  async next(_t: string, prefix: string) {
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

export class FakeApLedger implements ApLedger {
  readonly calls: string[] = [];
  async invoicePosted(inv: VendorInvoice) {
    this.calls.push(`invoice:${inv.id}`);
  }
  async invoiceVoided(inv: VendorInvoice) {
    this.calls.push(`invoice-void:${inv.id}`);
  }
  async paymentPosted(v: PaymentVoucher) {
    this.calls.push(`payment:${v.id}`);
  }
  async paymentVoided(v: PaymentVoucher) {
    this.calls.push(`payment-void:${v.id}`);
  }
}
