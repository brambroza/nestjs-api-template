import { DomainError } from '../../../../shared/errors';

export class PurchaseRefInvalidError extends DomainError {
  readonly code = 'PURCHASE.REF_INVALID';
}

export class PurchaseVersionConflictError extends DomainError {
  readonly code = 'PURCHASE.VERSION_CONFLICT';
  constructor(
    readonly documentId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Document ${documentId} was modified concurrently (expected v${String(expectedVersion)}, found v${String(actualVersion)})`,
    );
  }
}

export class PurchaseApprovalPendingError extends DomainError {
  readonly code = 'PURCHASE.APPROVAL_PENDING';
  constructor(
    readonly documentId: string,
    readonly approvalRequestId: string | null,
  ) {
    super(`Document ${documentId} is still waiting for approval`);
  }
}

export class OverReceiptError extends DomainError {
  readonly code = 'PURCHASE.OVER_RECEIPT';
  constructor(
    readonly purchaseOrderLineId: string,
    readonly remaining: bigint,
    readonly requested: bigint,
  ) {
    super(
      `Line ${purchaseOrderLineId}: ${requested.toString()} received but only ${remaining.toString()} remains open`,
    );
  }
}

/** Shared by every purchase aggregate that goes through the approval framework. */
export type ApprovalAnswer =
  'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PENDING' | 'NONE';

export interface SubmitOutcome {
  readonly approvalRequestId: string;
  readonly approval: 'APPROVED' | 'PENDING';
}

export const MAX_PAYMENT_TERMS_DAYS = 365;
export const MAX_NOTES_LENGTH = 2000;

export function isInt(v: number): boolean {
  return Number.isInteger(v);
}

export function normaliseText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
}
