import type {
  ApprovalGateway,
  ApprovalOutcome,
  ApprovalStateView,
  ApprovalSubmitInput,
} from '../../../../approval';
import type {
  ConvertibleQuotation,
  QuotationConversion,
} from '../../../quotation';
import {
  DeliveryNote,
  DeliveryNoteVersionConflictError,
  OPEN_EXPOSURE_STATUSES,
  SalesOrder,
  SalesOrderVersionConflictError,
} from '../../domain';
import type { DeliveryNoteRepository } from '../ports/delivery-note.repository';
import type {
  SalesOrderOutbox,
  SalesOrderOutboxEnvelope,
} from '../ports/outbox.port';
import type {
  ListSalesOrdersFilter,
  ListSalesOrdersPage,
  SalesOrderRepository,
} from '../ports/sales-order.repository';

export class InMemorySalesOrderRepository implements SalesOrderRepository {
  readonly rows = new Map<string, SalesOrder>();

  async findById(tenantId: string, id: string): Promise<SalesOrder | null> {
    const so = this.rows.get(id);
    return so && so.snapshot().tenantId === tenantId
      ? SalesOrder.fromSnapshot(so.snapshot())
      : null;
  }
  async list(
    tenantId: string,
    f: ListSalesOrdersFilter,
  ): Promise<ListSalesOrdersPage> {
    const all = [...this.rows.values()].filter((so) => {
      const s = so.snapshot();
      return (
        s.tenantId === tenantId &&
        (!f.status || s.status === f.status) &&
        (!f.customerId || s.customerId === f.customerId)
      );
    });
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(so: SalesOrder): Promise<void> {
    this.rows.set(so.id, so);
  }
  async save(so: SalesOrder): Promise<SalesOrder> {
    const stored = this.rows.get(so.id);
    if (!stored || stored.version !== so.version) {
      throw new SalesOrderVersionConflictError(
        so.id,
        so.version,
        stored?.version ?? -1,
      );
    }
    const next = SalesOrder.fromSnapshot({
      ...so.snapshot(),
      version: so.version + 1,
    });
    this.rows.set(so.id, next);
    return next;
  }
  async sumOpenExposure(
    tenantId: string,
    customerId: string,
    currency: string,
    excludeOrderId: string | null,
  ): Promise<bigint> {
    return [...this.rows.values()]
      .map((so) => so.snapshot())
      .filter(
        (s) =>
          s.tenantId === tenantId &&
          s.customerId === customerId &&
          s.currency === currency &&
          s.id !== excludeOrderId &&
          OPEN_EXPOSURE_STATUSES.includes(s.status),
      )
      .reduce((sum, s) => sum + s.totalMinor, 0n);
  }
}

export class InMemoryDeliveryNoteRepository implements DeliveryNoteRepository {
  readonly rows = new Map<string, DeliveryNote>();
  async findById(tenantId: string, id: string): Promise<DeliveryNote | null> {
    const n = this.rows.get(id);
    return n && n.snapshot().tenantId === tenantId
      ? DeliveryNote.fromSnapshot(n.snapshot())
      : null;
  }
  async listForOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<readonly DeliveryNote[]> {
    return [...this.rows.values()].filter(
      (n) =>
        n.snapshot().tenantId === tenantId &&
        n.snapshot().salesOrderId === salesOrderId,
    );
  }
  async create(n: DeliveryNote): Promise<void> {
    this.rows.set(n.id, n);
  }
  async save(n: DeliveryNote): Promise<DeliveryNote> {
    const stored = this.rows.get(n.id);
    if (!stored || stored.version !== n.version) {
      throw new DeliveryNoteVersionConflictError(
        n.id,
        n.version,
        stored?.version ?? -1,
      );
    }
    const next = DeliveryNote.fromSnapshot({
      ...n.snapshot(),
      version: n.version + 1,
    });
    this.rows.set(n.id, next);
    return next;
  }
}

export class InMemorySalesOrderOutbox implements SalesOrderOutbox {
  readonly rows: SalesOrderOutboxEnvelope[] = [];
  async enqueue(envelope: SalesOrderOutboxEnvelope): Promise<void> {
    this.rows.push(envelope);
  }
}

/** Scripted approval framework: `nextOutcome` answers submit, `states` answers stateOf. */
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

export class FakeQuotationConversion implements QuotationConversion {
  readonly quotations = new Map<string, ConvertibleQuotation>();
  readonly converted: Array<{ quotationId: string; salesOrderId: string }> = [];
  async findForConversion(id: string): Promise<ConvertibleQuotation | null> {
    return this.quotations.get(id) ?? null;
  }
  async markConverted(
    quotationId: string,
    salesOrderId: string,
  ): Promise<void> {
    this.converted.push({ quotationId, salesOrderId });
    const q = this.quotations.get(quotationId);
    if (q) this.quotations.set(quotationId, { ...q, salesOrderId });
  }
}
