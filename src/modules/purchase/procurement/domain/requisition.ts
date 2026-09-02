import { isIsoDate, type IsoDate } from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

import {
  PurchaseApprovalPendingError,
  isInt,
  normaliseText,
  type ApprovalAnswer,
  type SubmitOutcome,
} from './errors';

export const RequisitionStatus = {
  Draft: 'DRAFT',
  PendingApproval: 'PENDING_APPROVAL',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
  Cancelled: 'CANCELLED',
  Converted: 'CONVERTED',
} as const;
export type RequisitionStatus =
  (typeof RequisitionStatus)[keyof typeof RequisitionStatus];
export function isRequisitionStatus(v: string): v is RequisitionStatus {
  return (Object.values(RequisitionStatus) as string[]).includes(v);
}

const TRANSITIONS: Readonly<
  Record<RequisitionStatus, readonly RequisitionStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['CONVERTED', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  CANCELLED: [],
  CONVERTED: [],
};

export function canTransitionRequisition(
  from: RequisitionStatus,
  to: RequisitionStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export class RequisitionNotFoundError extends DomainError {
  readonly code = 'PURCHASE.REQUISITION_NOT_FOUND';
  constructor(readonly requisitionId: string) {
    super(`Purchase requisition ${requisitionId} not found`);
  }
}

export class IllegalRequisitionTransitionError extends DomainError {
  readonly code = 'PURCHASE.ILLEGAL_REQUISITION_TRANSITION';
  constructor(
    readonly requisitionId: string,
    readonly from: RequisitionStatus,
    readonly to: RequisitionStatus,
  ) {
    super(`Requisition ${requisitionId}: ${from} -> ${to} is not allowed`);
  }
}

export class RequisitionNotEditableError extends DomainError {
  readonly code = 'PURCHASE.REQUISITION_NOT_EDITABLE';
  constructor(
    readonly requisitionId: string,
    readonly status: RequisitionStatus,
  ) {
    super(
      `Requisition ${requisitionId} is ${status}; only DRAFT can be edited`,
    );
  }
}

export class InvalidRequisitionError extends DomainError {
  readonly code = 'PURCHASE.INVALID_REQUISITION';
}

export class RequisitionNotConvertibleError extends DomainError {
  readonly code = 'PURCHASE.REQUISITION_NOT_CONVERTIBLE';
}

export const MAX_REQUISITION_LINES = 500;
export const MAX_PURPOSE_LENGTH = 500;

export interface RequisitionLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly description: string;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly estimatedUnitPriceMinor: bigint;
  readonly suggestedVendorId: string | null;
}

export interface RequisitionLineSnapshot extends RequisitionLineInput {
  readonly lineNo: number;
  readonly estimatedTotalMinor: bigint;
}

export interface RequisitionSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly requesterId: string;
  readonly neededByDate: IsoDate | null;
  readonly purpose: string | null;
  readonly status: RequisitionStatus;
  readonly currency: string;
  readonly estimatedTotalMinor: bigint;
  readonly approvalRequestId: string | null;
  readonly purchaseOrderId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly submittedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly lines: readonly RequisitionLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRequisitionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly requesterId: string;
  readonly neededByDate?: IsoDate | null;
  readonly purpose?: string | null;
  readonly currency: string;
  readonly lines: readonly RequisitionLineInput[];
  readonly now: Date;
}

export interface RequisitionHeaderPatch {
  readonly neededByDate?: IsoDate | null;
  readonly purpose?: string | null;
}

function buildLines(
  inputs: readonly RequisitionLineInput[],
): RequisitionLineSnapshot[] {
  if (inputs.length > MAX_REQUISITION_LINES) {
    throw new InvalidRequisitionError(
      `a requisition has at most ${String(MAX_REQUISITION_LINES)} lines`,
    );
  }
  const ids = new Set<string>();
  return inputs.map((l, i) => {
    const at = `line ${String(i + 1)}`;
    if (ids.has(l.id))
      throw new InvalidRequisitionError(`duplicate line id ${l.id}`);
    ids.add(l.id);
    if (l.quantity <= 0n)
      throw new InvalidRequisitionError(`${at}: quantity must be > 0`);
    if (l.estimatedUnitPriceMinor < 0n) {
      throw new InvalidRequisitionError(`${at}: estimated price must be >= 0`);
    }
    const description = l.description.trim();
    if (description.length === 0 || description.length > 200) {
      throw new InvalidRequisitionError(
        `${at}: description must be 1..200 characters`,
      );
    }
    const uomCode = l.uomCode.trim().toUpperCase();
    if (uomCode.length === 0)
      throw new InvalidRequisitionError(`${at}: uomCode is required`);
    return {
      ...l,
      description,
      uomCode,
      lineNo: i + 1,
      estimatedTotalMinor: l.estimatedUnitPriceMinor * l.quantity,
    };
  });
}

function validateHeader(
  neededByDate: IsoDate | null,
  purpose: string | null,
): void {
  if (neededByDate !== null && !isIsoDate(neededByDate)) {
    throw new InvalidRequisitionError('neededByDate must be YYYY-MM-DD');
  }
  if (purpose !== null && purpose.length > MAX_PURPOSE_LENGTH) {
    throw new InvalidRequisitionError(
      `purpose must be <= ${String(MAX_PURPOSE_LENGTH)} characters`,
    );
  }
}

const sum = (lines: readonly RequisitionLineSnapshot[]): bigint =>
  lines.reduce((acc, l) => acc + l.estimatedTotalMinor, 0n);

/**
 * Purchase requisition (T-220). An internal request with estimated
 * amounts; approval runs against PURCHASE_REQUISITION with the
 * estimated total. APPROVED → CONVERTED once a PO is created from it.
 */
export class PurchaseRequisition {
  private constructor(private readonly s: RequisitionSnapshot) {}

  static create(props: CreateRequisitionProps): PurchaseRequisition {
    const currency = props.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvalidRequisitionError('currency must be an ISO 4217 code');
    }
    if (props.number.trim().length === 0)
      throw new InvalidRequisitionError('number is required');
    const purpose = normaliseText(props.purpose);
    const neededByDate = props.neededByDate ?? null;
    validateHeader(neededByDate, purpose);
    const lines = buildLines(props.lines);
    return new PurchaseRequisition({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number.trim(),
      requesterId: props.requesterId,
      neededByDate,
      purpose,
      status: RequisitionStatus.Draft,
      currency,
      estimatedTotalMinor: sum(lines),
      approvalRequestId: null,
      purchaseOrderId: null,
      version: 0,
      createdBy: props.requesterId,
      submittedAt: null,
      resolvedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: RequisitionSnapshot): PurchaseRequisition {
    return new PurchaseRequisition(s);
  }

  snapshot(): RequisitionSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): RequisitionStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  private assertEditable(): void {
    if (this.s.status !== RequisitionStatus.Draft) {
      throw new RequisitionNotEditableError(this.s.id, this.s.status);
    }
  }

  private transition(
    to: RequisitionStatus,
    now: Date,
    patch: Partial<RequisitionSnapshot> = {},
  ): PurchaseRequisition {
    if (!canTransitionRequisition(this.s.status, to)) {
      throw new IllegalRequisitionTransitionError(this.s.id, this.s.status, to);
    }
    return new PurchaseRequisition({
      ...this.s,
      ...patch,
      status: to,
      updatedAt: now,
    });
  }

  updateHeader(patch: RequisitionHeaderPatch, now: Date): PurchaseRequisition {
    this.assertEditable();
    const neededByDate =
      patch.neededByDate === undefined
        ? this.s.neededByDate
        : patch.neededByDate;
    const purpose =
      patch.purpose === undefined
        ? this.s.purpose
        : normaliseText(patch.purpose);
    validateHeader(neededByDate, purpose);
    return new PurchaseRequisition({
      ...this.s,
      neededByDate,
      purpose,
      updatedAt: now,
    });
  }

  replaceLines(
    inputs: readonly RequisitionLineInput[],
    now: Date,
  ): PurchaseRequisition {
    this.assertEditable();
    const lines = buildLines(inputs);
    return new PurchaseRequisition({
      ...this.s,
      lines,
      estimatedTotalMinor: sum(lines),
      updatedAt: now,
    });
  }

  submit(outcome: SubmitOutcome, now: Date): PurchaseRequisition {
    if (this.s.lines.length === 0) {
      throw new InvalidRequisitionError(
        'a requisition needs at least one line to be submitted',
      );
    }
    const patch = {
      approvalRequestId: outcome.approvalRequestId,
      submittedAt: now,
    };
    return outcome.approval === 'APPROVED'
      ? this.transition(RequisitionStatus.Approved, now, {
          ...patch,
          resolvedAt: now,
        })
      : this.transition(RequisitionStatus.PendingApproval, now, patch);
  }

  applyApprovalOutcome(answer: ApprovalAnswer, now: Date): PurchaseRequisition {
    if (this.s.status !== RequisitionStatus.PendingApproval) {
      throw new IllegalRequisitionTransitionError(
        this.s.id,
        this.s.status,
        RequisitionStatus.Approved,
      );
    }
    switch (answer) {
      case 'APPROVED':
        return this.transition(RequisitionStatus.Approved, now, {
          resolvedAt: now,
        });
      case 'REJECTED':
        return this.transition(RequisitionStatus.Rejected, now, {
          resolvedAt: now,
        });
      case 'CANCELLED':
      case 'NONE':
        return this.transition(RequisitionStatus.Draft, now, {
          approvalRequestId: null,
          submittedAt: null,
        });
      case 'PENDING':
        throw new PurchaseApprovalPendingError(
          this.s.id,
          this.s.approvalRequestId,
        );
    }
  }

  reopen(now: Date): PurchaseRequisition {
    return this.transition(RequisitionStatus.Draft, now, {
      approvalRequestId: null,
      submittedAt: null,
      resolvedAt: null,
    });
  }

  cancel(now: Date): PurchaseRequisition {
    return this.transition(RequisitionStatus.Cancelled, now, {
      resolvedAt: now,
    });
  }

  get isConvertible(): boolean {
    return (
      this.s.status === RequisitionStatus.Approved &&
      this.s.purchaseOrderId === null
    );
  }

  markConverted(purchaseOrderId: string, now: Date): PurchaseRequisition {
    if (!this.isConvertible) {
      throw new RequisitionNotConvertibleError(
        `requisition ${this.s.number} is ${this.s.status}${this.s.purchaseOrderId ? ` (already PO ${this.s.purchaseOrderId})` : ''}`,
      );
    }
    return this.transition(RequisitionStatus.Converted, now, {
      purchaseOrderId,
    });
  }
}

export { isInt };
