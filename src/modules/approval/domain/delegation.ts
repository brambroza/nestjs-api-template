import { DomainError } from '../../../shared/errors';

export class DelegationNotFoundError extends DomainError {
  readonly code = 'APPROVAL.DELEGATION_NOT_FOUND';
  constructor(readonly delegationId: string) {
    super(`Delegation ${delegationId} not found`);
  }
}
export class InvalidDelegationError extends DomainError {
  readonly code = 'APPROVAL.INVALID_DELEGATION';
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DelegationSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  /** YYYY-MM-DD inclusive. */
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

/** "fromUser lends their approval roles to toUser for these dates." */
export class Delegation {
  private constructor(private readonly s: DelegationSnapshot) {}

  static create(props: {
    readonly id: string;
    readonly tenantId: string;
    readonly fromUserId: string;
    readonly toUserId: string;
    readonly fromDate: string;
    readonly toDate: string;
    readonly reason?: string | null;
    readonly now: Date;
  }): Delegation {
    if (props.fromUserId === props.toUserId) {
      throw new InvalidDelegationError('cannot delegate to yourself');
    }
    if (!ISO_RE.test(props.fromDate) || !ISO_RE.test(props.toDate)) {
      throw new InvalidDelegationError('fromDate/toDate must be YYYY-MM-DD');
    }
    if (props.toDate < props.fromDate) {
      throw new InvalidDelegationError('toDate must not be before fromDate');
    }
    const reason = (props.reason ?? '').trim() || null;
    if (reason !== null && reason.length > 200) {
      throw new InvalidDelegationError('reason must be <= 200 characters');
    }
    return new Delegation({
      id: props.id,
      tenantId: props.tenantId,
      fromUserId: props.fromUserId,
      toUserId: props.toUserId,
      fromDate: props.fromDate,
      toDate: props.toDate,
      reason,
      isActive: true,
      createdAt: props.now,
    });
  }

  static fromSnapshot(s: DelegationSnapshot): Delegation {
    return new Delegation(s);
  }

  isActiveOn(date: string): boolean {
    return this.s.isActive && this.s.fromDate <= date && date <= this.s.toDate;
  }

  revoke(): Delegation {
    if (!this.s.isActive) return this;
    return new Delegation({ ...this.s, isActive: false });
  }

  snapshot(): DelegationSnapshot {
    return this.s;
  }
}
