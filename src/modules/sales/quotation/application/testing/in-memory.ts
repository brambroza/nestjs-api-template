import { Quotation, QuotationVersionConflictError } from '../../domain';
import type {
  QuotationOutbox,
  QuotationOutboxEnvelope,
} from '../ports/outbox.port';
import type {
  ListQuotationsFilter,
  ListQuotationsPage,
  QuotationRepository,
} from '../ports/quotation.repository';

export class InMemoryQuotationRepository implements QuotationRepository {
  readonly rows = new Map<string, Quotation>();

  async findById(tenantId: string, id: string): Promise<Quotation | null> {
    const q = this.rows.get(id);
    return q && q.snapshot().tenantId === tenantId
      ? Quotation.fromSnapshot(q.snapshot())
      : null;
  }
  async findRevisions(
    tenantId: string,
    number: string,
  ): Promise<readonly Quotation[]> {
    return [...this.rows.values()]
      .filter(
        (q) =>
          q.snapshot().tenantId === tenantId && q.snapshot().number === number,
      )
      .sort((a, b) => b.snapshot().revision - a.snapshot().revision);
  }
  async list(
    tenantId: string,
    f: ListQuotationsFilter,
  ): Promise<ListQuotationsPage> {
    const all = [...this.rows.values()].filter((q) => {
      const s = q.snapshot();
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
  async create(q: Quotation): Promise<void> {
    this.rows.set(q.id, q);
  }
  async save(q: Quotation): Promise<Quotation> {
    const stored = this.rows.get(q.id);
    if (!stored || stored.version !== q.version) {
      throw new QuotationVersionConflictError(
        q.id,
        q.version,
        stored?.version ?? -1,
      );
    }
    const next = Quotation.fromSnapshot({
      ...q.snapshot(),
      version: q.version + 1,
    });
    this.rows.set(q.id, next);
    return next;
  }
  async listDueForExpiry(
    onDate: string,
    limit: number,
  ): Promise<readonly Quotation[]> {
    return [...this.rows.values()]
      .filter((q) => q.isDueForExpiry(onDate))
      .slice(0, limit);
  }
}

export class InMemoryOutbox implements QuotationOutbox {
  readonly rows: QuotationOutboxEnvelope[] = [];
  async enqueue(envelope: QuotationOutboxEnvelope): Promise<void> {
    this.rows.push(envelope);
  }
}
