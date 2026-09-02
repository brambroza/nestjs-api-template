import { DomainError } from '../../../shared/errors';

import { IllegalTransferTransitionError, InvalidTransferError } from './errors';

export const TransferStatus = {
  Draft: 'DRAFT',
  InTransit: 'IN_TRANSIT',
  Received: 'RECEIVED',
  Cancelled: 'CANCELLED',
} as const;
export type TransferStatus =
  (typeof TransferStatus)[keyof typeof TransferStatus];
export function isTransferStatus(v: string): v is TransferStatus {
  return (Object.values(TransferStatus) as string[]).includes(v);
}

const TRANSITIONS: Readonly<Record<TransferStatus, readonly TransferStatus[]>> =
  {
    DRAFT: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['RECEIVED'],
    RECEIVED: [],
    CANCELLED: [],
  };

export interface TransferLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly lotId: string | null;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly serialNumbers: readonly string[];
}

export interface TransferLineSnapshot extends TransferLineInput {
  readonly lineNo: number;
  /** Cost carried from the source at ship time; 0 until shipped. */
  readonly unitCostMinor: bigint;
}

export interface StockTransferSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly status: TransferStatus;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly shippedAt: Date | null;
  readonly receivedAt: Date | null;
  readonly lines: readonly TransferLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateTransferProps {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly TransferLineInput[];
  readonly now: Date;
}

export class TransferInTransitError extends DomainError {
  readonly code = 'INVENTORY.ILLEGAL_TRANSFER_TRANSITION';
}

/**
 * Warehouse transfer (T-324). Ship = TRANSFER_OUT at the source (stock
 * leaves; the document holds it "in transit" with its unit cost);
 * receive = TRANSFER_IN at the destination at that carried cost.
 */
export class StockTransfer {
  private constructor(private readonly s: StockTransferSnapshot) {}

  static create(props: CreateTransferProps): StockTransfer {
    if (props.fromWarehouseId === props.toWarehouseId) {
      throw new InvalidTransferError(
        'source and destination warehouses must differ',
      );
    }
    if (props.lines.length === 0)
      throw new InvalidTransferError('a transfer needs at least one line');
    const notes = (props.notes ?? '').trim() || null;
    if (notes !== null && notes.length > 2000) {
      throw new InvalidTransferError('notes must be <= 2000 characters');
    }
    const ids = new Set<string>();
    const lines = props.lines.map((l, i) => {
      if (ids.has(l.id))
        throw new InvalidTransferError(`duplicate line id ${l.id}`);
      ids.add(l.id);
      if (l.quantity <= 0n)
        throw new InvalidTransferError(
          `line ${String(i + 1)}: quantity must be > 0`,
        );
      return { ...l, lineNo: i + 1, unitCostMinor: 0n };
    });
    return new StockTransfer({
      id: props.id,
      tenantId: props.tenantId,
      number: props.number,
      fromWarehouseId: props.fromWarehouseId,
      toWarehouseId: props.toWarehouseId,
      status: TransferStatus.Draft,
      notes,
      version: 0,
      createdBy: props.createdBy,
      shippedAt: null,
      receivedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: StockTransferSnapshot): StockTransfer {
    return new StockTransfer(s);
  }

  snapshot(): StockTransferSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): TransferStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  private transition(
    to: TransferStatus,
    now: Date,
    patch: Partial<StockTransferSnapshot> = {},
  ): StockTransfer {
    if (!TRANSITIONS[this.s.status].includes(to)) {
      throw new IllegalTransferTransitionError(this.s.id, this.s.status, to);
    }
    return new StockTransfer({
      ...this.s,
      ...patch,
      status: to,
      updatedAt: now,
    });
  }

  /** `unitCosts` = the FIFO/average cost the source charged per line id. */
  ship(unitCosts: ReadonlyMap<string, bigint>, now: Date): StockTransfer {
    const lines = this.s.lines.map((l) => ({
      ...l,
      unitCostMinor: unitCosts.get(l.id) ?? 0n,
    }));
    return this.transition(TransferStatus.InTransit, now, {
      lines,
      shippedAt: now,
    });
  }

  receive(now: Date): StockTransfer {
    return this.transition(TransferStatus.Received, now, { receivedAt: now });
  }

  cancel(now: Date): StockTransfer {
    return this.transition(TransferStatus.Cancelled, now);
  }
}
