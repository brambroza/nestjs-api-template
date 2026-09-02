import { isIsoDate, type IsoDate } from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

export const DeliveryNoteStatus = {
  Draft: 'DRAFT',
  Shipped: 'SHIPPED',
  Cancelled: 'CANCELLED',
} as const;
export type DeliveryNoteStatus =
  (typeof DeliveryNoteStatus)[keyof typeof DeliveryNoteStatus];
export function isDeliveryNoteStatus(v: string): v is DeliveryNoteStatus {
  return (Object.values(DeliveryNoteStatus) as string[]).includes(v);
}

export class DeliveryNoteNotFoundError extends DomainError {
  readonly code = 'SALES.DELIVERY_NOTE_NOT_FOUND';
  constructor(readonly deliveryNoteId: string) {
    super(`Delivery note ${deliveryNoteId} not found`);
  }
}

export class IllegalDeliveryNoteTransitionError extends DomainError {
  readonly code = 'SALES.ILLEGAL_DELIVERY_NOTE_TRANSITION';
  constructor(
    readonly deliveryNoteId: string,
    readonly from: DeliveryNoteStatus,
    readonly to: DeliveryNoteStatus,
  ) {
    super(`Delivery note ${deliveryNoteId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvalidDeliveryNoteError extends DomainError {
  readonly code = 'SALES.INVALID_DELIVERY_NOTE';
}

export class DeliveryNoteVersionConflictError extends DomainError {
  readonly code = 'SALES.VERSION_CONFLICT';
  constructor(
    readonly deliveryNoteId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Delivery note ${deliveryNoteId} was modified concurrently (expected v${String(expectedVersion)}, found v${String(actualVersion)})`,
    );
  }
}

export interface DeliveryNoteLineInput {
  readonly id: string;
  readonly salesOrderLineId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly uomCode: string;
  readonly quantity: bigint;
}

export interface DeliveryNoteLineSnapshot extends DeliveryNoteLineInput {
  readonly lineNo: number;
}

export interface DeliveryNoteSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly number: string;
  readonly status: DeliveryNoteStatus;
  readonly deliveryDate: IsoDate;
  readonly warehouseId: string | null;
  readonly shipToAddress: string | null;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly shippedAt: Date | null;
  readonly lines: readonly DeliveryNoteLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDeliveryNoteProps {
  readonly id: string;
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly number: string;
  readonly deliveryDate: IsoDate;
  readonly warehouseId?: string | null;
  readonly shipToAddress?: string | null;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly DeliveryNoteLineInput[];
  readonly now: Date;
}

const MAX_ADDRESS = 500;
const MAX_NOTES = 2000;

function clean(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length > max) {
    throw new InvalidDeliveryNoteError(
      `${field} must be <= ${String(max)} characters`,
    );
  }
  return t.length === 0 ? null : t;
}

/**
 * Delivery note (T-214). DRAFT → SHIPPED posts quantities onto the
 * sales order (see SalesOrder.recordDelivery); DRAFT → CANCELLED
 * discards it. A shipped note is immutable — corrections are a
 * return (Phase C RMA), never an edit.
 */
export class DeliveryNote {
  private constructor(private readonly s: DeliveryNoteSnapshot) {}

  static create(props: CreateDeliveryNoteProps): DeliveryNote {
    if (!isIsoDate(props.deliveryDate)) {
      throw new InvalidDeliveryNoteError('deliveryDate must be YYYY-MM-DD');
    }
    if (props.lines.length === 0) {
      throw new InvalidDeliveryNoteError(
        'a delivery note needs at least one line',
      );
    }
    const seen = new Set<string>();
    const lines = props.lines.map((l, i) => {
      if (l.quantity <= 0n) {
        throw new InvalidDeliveryNoteError(
          `line ${String(i + 1)}: quantity must be > 0`,
        );
      }
      if (seen.has(l.salesOrderLineId)) {
        throw new InvalidDeliveryNoteError(
          `order line ${l.salesOrderLineId} appears more than once`,
        );
      }
      seen.add(l.salesOrderLineId);
      return { ...l, lineNo: i + 1 };
    });
    return new DeliveryNote({
      id: props.id,
      tenantId: props.tenantId,
      salesOrderId: props.salesOrderId,
      number: props.number,
      status: DeliveryNoteStatus.Draft,
      deliveryDate: props.deliveryDate,
      warehouseId: props.warehouseId ?? null,
      shipToAddress: clean(props.shipToAddress, MAX_ADDRESS, 'shipToAddress'),
      notes: clean(props.notes, MAX_NOTES, 'notes'),
      version: 0,
      createdBy: props.createdBy,
      shippedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: DeliveryNoteSnapshot): DeliveryNote {
    return new DeliveryNote(s);
  }

  snapshot(): DeliveryNoteSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): DeliveryNoteStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  private transition(
    to: DeliveryNoteStatus,
    now: Date,
    patch: Partial<DeliveryNoteSnapshot> = {},
  ): DeliveryNote {
    if (this.s.status !== DeliveryNoteStatus.Draft) {
      throw new IllegalDeliveryNoteTransitionError(
        this.s.id,
        this.s.status,
        to,
      );
    }
    return new DeliveryNote({
      ...this.s,
      ...patch,
      status: to,
      updatedAt: now,
    });
  }

  ship(now: Date): DeliveryNote {
    return this.transition(DeliveryNoteStatus.Shipped, now, { shippedAt: now });
  }

  cancel(now: Date): DeliveryNote {
    return this.transition(DeliveryNoteStatus.Cancelled, now);
  }
}
