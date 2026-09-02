import type { Clock } from '../../../../../shared/clock';
import type { IsoDate } from '../../../../../shared/domain';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import {
  ArVersionConflictError,
  PostingPeriodClosedError,
  Receipt,
  SalesInvoice,
  type ArEvent,
} from '../../domain';
import type {
  ArLedger,
  ArOutbox,
  ArOutboxEnvelope,
  ArPostingGate,
  ArRefLookup,
  ArTax,
  BillingAddressRef,
  BranchRef,
  CompanyRef,
  CustomerRef,
  InvoiceFilter,
  ItemRef,
  ReceiptFilter,
  ReceiptRepository,
  SalesInvoiceRepository,
  SalesOrderForInvoicing,
  TaxDocumentKind,
  TaxInvoiceNumberGenerator,
} from '../ports';

export class InMemoryInvoices implements SalesInvoiceRepository {
  readonly rows = new Map<string, SalesInvoice>();
  async findById(tenantId: string, id: string) {
    const i = this.rows.get(id);
    return i && i.snapshot().tenantId === tenantId ? i : null;
  }
  async list(tenantId: string, f: InvoiceFilter) {
    const all = [...this.rows.values()].filter((i) => {
      const s = i.snapshot();
      return (
        s.tenantId === tenantId &&
        (!f.status || s.status === f.status) &&
        (!f.type || s.type === f.type) &&
        (!f.customerId || s.customerId === f.customerId)
      );
    });
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async listOpen(tenantId: string, customerId: string | null) {
    return [...this.rows.values()]
      .filter(
        (i) =>
          i.snapshot().tenantId === tenantId &&
          i.isOpen &&
          i.snapshot().type === 'INVOICE' &&
          (!customerId || i.snapshot().customerId === customerId),
      )
      .sort((a, b) => (a.snapshot().dueDate < b.snapshot().dueDate ? -1 : 1));
  }
  async invoicedQtyBySalesOrderLine(tenantId: string, salesOrderId: string) {
    const m = new Map<string, bigint>();
    for (const i of this.rows.values()) {
      const s = i.snapshot();
      if (
        s.tenantId !== tenantId ||
        s.salesOrderId !== salesOrderId ||
        s.type !== 'INVOICE' ||
        s.status === 'VOID'
      )
        continue;
      for (const l of s.lines)
        if (l.salesOrderLineId)
          m.set(
            l.salesOrderLineId,
            (m.get(l.salesOrderLineId) ?? 0n) + l.quantity,
          );
    }
    return m;
  }
  async listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ) {
    return [...this.rows.values()].filter((i) => {
      const s = i.snapshot();
      return (
        s.tenantId === tenantId &&
        s.customerId === customerId &&
        s.invoiceDate >= from &&
        s.invoiceDate <= to
      );
    });
  }
  async create(inv: SalesInvoice) {
    this.rows.set(inv.id, inv);
  }
  async save(inv: SalesInvoice) {
    const stored = this.rows.get(inv.id);
    if (!stored || stored.version !== inv.version)
      throw new ArVersionConflictError(
        inv.id,
        inv.version,
        stored?.version ?? -1,
      );
    const next = SalesInvoice.fromSnapshot({
      ...inv.snapshot(),
      version: inv.version + 1,
    });
    this.rows.set(inv.id, next);
    return next;
  }
}

export class InMemoryReceipts implements ReceiptRepository {
  readonly rows = new Map<string, Receipt>();
  async findById(tenantId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.snapshot().tenantId === tenantId ? r : null;
  }
  async list(tenantId: string, f: ReceiptFilter) {
    const all = [...this.rows.values()].filter(
      (r) =>
        r.snapshot().tenantId === tenantId &&
        (!f.customerId || r.snapshot().customerId === f.customerId) &&
        (!f.status || r.status === f.status),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ) {
    return [...this.rows.values()].filter((r) => {
      const s = r.snapshot();
      return (
        s.tenantId === tenantId &&
        s.customerId === customerId &&
        s.receiptDate >= from &&
        s.receiptDate <= to
      );
    });
  }
  async create(r: Receipt) {
    this.rows.set(r.id, r);
  }
  async save(r: Receipt) {
    const stored = this.rows.get(r.id);
    if (!stored || stored.version !== r.version)
      throw new ArVersionConflictError(r.id, r.version, stored?.version ?? -1);
    const next = Receipt.fromSnapshot({
      ...r.snapshot(),
      version: r.version + 1,
    });
    this.rows.set(r.id, next);
    return next;
  }
}

export class FakeTaxNumbers implements TaxInvoiceNumberGenerator {
  private readonly counters = new Map<string, number>();
  async next(
    _t: string,
    kind: TaxDocumentKind,
    _branchId: string,
    branchNumber: string,
    date: IsoDate,
  ) {
    const ym = date.slice(0, 7).replace('-', '');
    const key = `${kind}:${branchNumber}:${ym}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    return `${kind}${branchNumber}-${ym}-${String(n).padStart(5, '0')}`;
  }
}

export class InMemoryArRefLookup implements ArRefLookup {
  readonly companies = new Map<string, CompanyRef>();
  readonly branches = new Map<string, BranchRef>();
  readonly customers = new Map<string, CustomerRef>();
  readonly addresses = new Map<string, BillingAddressRef>();
  readonly items = new Map<string, ItemRef>();
  readonly orders = new Map<string, SalesOrderForInvoicing>();
  async findCompany(_t: string, id: string) {
    return this.companies.get(id) ?? null;
  }
  async findBranch(_t: string, id: string) {
    return this.branches.get(id) ?? null;
  }
  async findHeadOfficeBranch(_t: string, companyId: string) {
    return (
      [...this.branches.values()].find(
        (b) => b.companyId === companyId && b.branchNumber === '00000',
      ) ?? null
    );
  }
  async findCustomer(_t: string, id: string) {
    return this.customers.get(id) ?? null;
  }
  async findBillingAddress(_t: string, customerId: string) {
    return this.addresses.get(customerId) ?? null;
  }
  async findItem(_t: string, id: string) {
    return this.items.get(id) ?? null;
  }
  async findSalesOrderForInvoicing(_t: string, id: string) {
    return this.orders.get(id) ?? null;
  }
}

export class FakeArTax implements ArTax {
  async resolveVat() {
    return { taxCodeId: 'tax-vat7', taxCode: 'VAT7', rateBasisPoints: 700 };
  }
}

export class FakePostingGate implements ArPostingGate {
  closedBefore: IsoDate | null = null;
  async assertOpen(companyId: string, date: IsoDate) {
    if (this.closedBefore && date < this.closedBefore)
      throw new PostingPeriodClosedError(companyId, date, 'PERIOD_LOCKED');
  }
}

export class InMemoryArOutbox implements ArOutbox {
  readonly rows: ArOutboxEnvelope[] = [];
  async enqueue(e: ArOutboxEnvelope) {
    this.rows.push(e);
  }
  get types(): ArEvent['type'][] {
    return this.rows.map((r) => r.event.type);
  }
}

export class FakeNumbers implements DocumentNumberGenerator {
  private n = 0;
  async next(_t: string, prefix: string) {
    this.n += 1;
    return `${prefix}-202609-${String(this.n).padStart(4, '0')}`;
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

export class FakeArLedger implements ArLedger {
  readonly calls: string[] = [];
  async invoiceIssued(inv: SalesInvoice) {
    this.calls.push(`invoice:${inv.id}`);
  }
  async invoiceVoided(inv: SalesInvoice) {
    this.calls.push(`invoice-void:${inv.id}`);
  }
  async receiptPosted(r: Receipt) {
    this.calls.push(`receipt:${r.id}`);
  }
  async receiptVoided(r: Receipt) {
    this.calls.push(`receipt-void:${r.id}`);
  }
}
