import { DomainError } from '../../../shared/errors';

export const CountStatus = {
  Draft: 'DRAFT',
  Counting: 'COUNTING',
  Review: 'REVIEW',
  Posted: 'POSTED',
  Cancelled: 'CANCELLED',
} as const;
export type CountStatus = (typeof CountStatus)[keyof typeof CountStatus];
export function isCountStatus(v: string): v is CountStatus {
  return (Object.values(CountStatus) as string[]).includes(v);
}

const TRANSITIONS: Readonly<Record<CountStatus, readonly CountStatus[]>> = {
  DRAFT: ['COUNTING', 'CANCELLED'],
  COUNTING: ['REVIEW', 'CANCELLED'],
  REVIEW: ['POSTED', 'COUNTING', 'CANCELLED'],
  POSTED: [],
  CANCELLED: [],
};

export class CountNotFoundError extends DomainError {
  readonly code = 'INVENTORY.COUNT_NOT_FOUND';
  constructor(readonly countId: string) {
    super(`Stock count ${countId} not found`);
  }
}

export class IllegalCountTransitionError extends DomainError {
  readonly code = 'INVENTORY.ILLEGAL_COUNT_TRANSITION';
  constructor(
    readonly countId: string,
    readonly from: CountStatus,
    readonly to: CountStatus,
  ) {
    super(`Stock count ${countId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvalidCountError extends DomainError {
  readonly code = 'INVENTORY.INVALID_COUNT';
}

export class CountApprovalPendingError extends DomainError {
  readonly code = 'INVENTORY.COUNT_APPROVAL_PENDING';
  constructor(
    readonly countId: string,
    readonly approvalRequestId: string | null,
  ) {
    super(`Stock count ${countId} is waiting for adjustment approval`);
  }
}

export interface CountLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly lotId: string | null;
  readonly lotNumber: string | null;
  readonly uomCode: string;
  readonly systemQty: bigint;
  readonly unitCostMinor: bigint;
}

export interface CountLineSnapshot extends CountLineInput {
  readonly lineNo: number;
  readonly countedQty: bigint | null;
  /** counted − system; 0 while uncounted. */
  readonly varianceQty: bigint;
}

export interface StockCountSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly warehouseId: string;
  readonly status: CountStatus;
  readonly notes: string | null;
  readonly approvalRequestId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly countedAt: Date | null;
  readonly postedAt: Date | null;
  readonly lines: readonly CountLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCountProps {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly warehouseId: string;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly CountLineInput[];
  readonly now: Date;
}

export interface CountEntry {
  readonly lineId: string;
  readonly countedQty: bigint;
}

/**
 * Physical count (T-325): sheet (system quantities frozen) → count →
 * review (variances) → adjustment approval → post ADJUST_IN/OUT via the
 * ledger. Recount is allowed from review. Posted sheets are immutable.
 */
export class StockCount {
  private constructor(private readonly s: StockCountSnapshot) {}

  static create(props: CreateCountProps): StockCount {
    if (props.lines.length === 0)
      throw new InvalidCountError('a count sheet needs at least one line');
    const notes = (props.notes ?? '').trim() || null;
    if (notes !== null && notes.length > 2000)
      throw new InvalidCountError('notes must be <= 2000 characters');
    const ids = new Set<string>();
    const lines = props.lines.map((l, i) => {
      if (ids.has(l.id))
        throw new InvalidCountError(`duplicate line id ${l.id}`);
      ids.add(l.id);
      if (l.systemQty < 0n)
        throw new InvalidCountError(
          `line ${String(i + 1)}: system quantity must be >= 0`,
        );
      return { ...l, lineNo: i + 1, countedQty: null, varianceQty: 0n };
    });
    return new StockCount({
      id: props.id,
      tenantId: props.tenantId,
      number: props.number,
      warehouseId: props.warehouseId,
      status: CountStatus.Draft,
      notes,
      approvalRequestId: null,
      version: 0,
      createdBy: props.createdBy,
      countedAt: null,
      postedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: StockCountSnapshot): StockCount {
    return new StockCount(s);
  }

  snapshot(): StockCountSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): CountStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  get hasVariance(): boolean {
    return this.s.lines.some((l) => l.varianceQty !== 0n);
  }

  /** Σ |variance| × unit cost — the amount the adjustment approval is measured on. */
  get varianceValueMinor(): bigint {
    return this.s.lines.reduce((sum, l) => {
      const v = l.varianceQty < 0n ? -l.varianceQty : l.varianceQty;
      return sum + v * l.unitCostMinor;
    }, 0n);
  }

  private transition(
    to: CountStatus,
    now: Date,
    patch: Partial<StockCountSnapshot> = {},
  ): StockCount {
    if (!TRANSITIONS[this.s.status].includes(to)) {
      throw new IllegalCountTransitionError(this.s.id, this.s.status, to);
    }
    return new StockCount({ ...this.s, ...patch, status: to, updatedAt: now });
  }

  start(now: Date): StockCount {
    return this.transition(CountStatus.Counting, now);
  }

  recordCounts(entries: readonly CountEntry[], now: Date): StockCount {
    if (this.s.status !== CountStatus.Counting) {
      throw new IllegalCountTransitionError(
        this.s.id,
        this.s.status,
        CountStatus.Counting,
      );
    }
    const byId = new Map(entries.map((e) => [e.lineId, e.countedQty]));
    for (const e of entries) {
      if (e.countedQty < 0n)
        throw new InvalidCountError(
          `line ${e.lineId}: counted quantity must be >= 0`,
        );
      if (!this.s.lines.some((l) => l.id === e.lineId)) {
        throw new InvalidCountError(`line ${e.lineId} is not on this sheet`);
      }
    }
    const lines = this.s.lines.map((l) => {
      const counted = byId.get(l.id);
      return counted === undefined
        ? l
        : { ...l, countedQty: counted, varianceQty: counted - l.systemQty };
    });
    return new StockCount({ ...this.s, lines, updatedAt: now });
  }

  submitForReview(now: Date): StockCount {
    const missing = this.s.lines.filter((l) => l.countedQty === null);
    if (missing.length > 0) {
      throw new InvalidCountError(
        `${String(missing.length)} line(s) have not been counted`,
      );
    }
    return this.transition(CountStatus.Review, now, { countedAt: now });
  }

  recount(now: Date): StockCount {
    return this.transition(CountStatus.Counting, now, {
      approvalRequestId: null,
    });
  }

  withApproval(approvalRequestId: string, now: Date): StockCount {
    if (this.s.status !== CountStatus.Review) {
      throw new IllegalCountTransitionError(
        this.s.id,
        this.s.status,
        CountStatus.Review,
      );
    }
    return new StockCount({ ...this.s, approvalRequestId, updatedAt: now });
  }

  post(now: Date): StockCount {
    return this.transition(CountStatus.Posted, now, { postedAt: now });
  }

  cancel(now: Date): StockCount {
    return this.transition(CountStatus.Cancelled, now);
  }
}
