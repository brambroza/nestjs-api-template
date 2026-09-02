import { DomainError } from '../../../../shared/errors';

import type { PartnerRef } from './partner-ref';

export const PdpaRequestType = {
  Export: 'EXPORT',
  Erasure: 'ERASURE',
} as const;
export type PdpaRequestType =
  (typeof PdpaRequestType)[keyof typeof PdpaRequestType];

export const PdpaRequestStatus = {
  Pending: 'PENDING',
  Completed: 'COMPLETED',
  Rejected: 'REJECTED',
} as const;
export type PdpaRequestStatus =
  (typeof PdpaRequestStatus)[keyof typeof PdpaRequestStatus];

export function isPdpaRequestType(v: string): v is PdpaRequestType {
  return v === PdpaRequestType.Export || v === PdpaRequestType.Erasure;
}

export class PdpaRequestNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.PDPA_REQUEST_NOT_FOUND';
  constructor(readonly requestId: string) {
    super(`PDPA request ${requestId} not found`);
  }
}

export class PdpaRequestAlreadyOpenError extends DomainError {
  readonly code = 'MASTER_DATA.PDPA_REQUEST_ALREADY_OPEN';
  constructor(
    readonly partner: PartnerRef,
    readonly requestType: PdpaRequestType,
    readonly existingRequestId: string,
  ) {
    super(
      `${partner.type} ${partner.id} already has a pending ${requestType} request (${existingRequestId})`,
    );
  }
}

export class IllegalPdpaRequestTransitionError extends DomainError {
  readonly code = 'MASTER_DATA.PDPA_REQUEST_ILLEGAL_TRANSITION';
  constructor(
    readonly requestId: string,
    readonly from: PdpaRequestStatus,
    readonly to: PdpaRequestStatus,
  ) {
    super(`PDPA request ${requestId} cannot go from ${from} to ${to}`);
  }
}

export class InvalidPdpaRequestFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_PDPA_REQUEST_FIELD';
}

export interface PdpaRequestSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly requestType: PdpaRequestType;
  readonly status: PdpaRequestStatus;
  readonly reason: string | null;
  readonly requestedBy: string;
  readonly requestedAt: Date;
  readonly completedBy: string | null;
  readonly completedAt: Date | null;
  readonly resultNote: string | null;
}

export interface CreatePdpaRequestProps {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly requestType: PdpaRequestType;
  readonly reason?: string | null;
  readonly requestedBy: string;
  readonly requestedAt: Date;
}

/**
 * Lifecycle: PENDING -> COMPLETED | REJECTED. Terminal states never
 * transition again; a second request is a new aggregate. The 30-day
 * statutory response window (PDPA §30) is a reporting concern, not a
 * domain invariant — `requestedAt` is what a report computes it from.
 */
export class PdpaRequest {
  private constructor(private readonly s: PdpaRequestSnapshot) {}

  static create(props: CreatePdpaRequestProps): PdpaRequest {
    return new PdpaRequest({
      id: props.id,
      tenantId: props.tenantId,
      partner: props.partner,
      requestType: props.requestType,
      status: PdpaRequestStatus.Pending,
      reason: bounded(props.reason, 500, 'reason'),
      requestedBy: props.requestedBy,
      requestedAt: props.requestedAt,
      completedBy: null,
      completedAt: null,
      resultNote: null,
    });
  }

  static fromSnapshot(s: PdpaRequestSnapshot): PdpaRequest {
    return new PdpaRequest(s);
  }

  complete(by: string, now: Date, note?: string | null): PdpaRequest {
    return this.transition(PdpaRequestStatus.Completed, by, now, note);
  }

  reject(by: string, now: Date, note?: string | null): PdpaRequest {
    return this.transition(PdpaRequestStatus.Rejected, by, now, note);
  }

  private transition(
    to: PdpaRequestStatus,
    by: string,
    now: Date,
    note: string | null | undefined,
  ): PdpaRequest {
    if (this.s.status !== PdpaRequestStatus.Pending) {
      throw new IllegalPdpaRequestTransitionError(this.s.id, this.s.status, to);
    }
    return new PdpaRequest({
      ...this.s,
      status: to,
      completedBy: by,
      completedAt: now,
      resultNote: bounded(note, 500, 'resultNote'),
    });
  }

  get isPending(): boolean {
    return this.s.status === PdpaRequestStatus.Pending;
  }

  snapshot(): PdpaRequestSnapshot {
    return this.s;
  }
}

function bounded(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length === 0) return null;
  if (t.length > max) {
    throw new InvalidPdpaRequestFieldError(
      `${field} must be at most ${String(max)} characters`,
    );
  }
  return t;
}
