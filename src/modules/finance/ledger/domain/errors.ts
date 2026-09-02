import { DomainError } from '../../../../shared/errors';

export class GlRefInvalidError extends DomainError {
  readonly code = 'GL.REF_INVALID';
}
export class JournalEntryNotFoundError extends DomainError {
  readonly code = 'GL.ENTRY_NOT_FOUND';
  constructor(readonly entryId: string) {
    super(`Journal entry ${entryId} not found`);
  }
}
export class IllegalJournalTransitionError extends DomainError {
  readonly code = 'GL.ILLEGAL_ENTRY_TRANSITION';
  constructor(
    readonly entryId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Journal entry ${entryId}: ${from} -> ${to} is not allowed`);
  }
}
export class InvalidJournalEntryError extends DomainError {
  readonly code = 'GL.INVALID_ENTRY';
}
export class UnbalancedJournalEntryError extends DomainError {
  readonly code = 'GL.UNBALANCED_ENTRY';
  constructor(
    readonly debitMinor: bigint,
    readonly creditMinor: bigint,
  ) {
    super(
      `Journal entry is not balanced: debit ${debitMinor.toString()} != credit ${creditMinor.toString()}`,
    );
  }
}
export class AccountMappingMissingError extends DomainError {
  readonly code = 'GL.ACCOUNT_MAPPING_MISSING';
  constructor(
    readonly companyId: string,
    readonly key: string,
  ) {
    super(`Company ${companyId} has no account mapped for ${key}`);
  }
}
export class AccountNotPostableError extends DomainError {
  readonly code = 'GL.ACCOUNT_NOT_POSTABLE';
  constructor(readonly accountCode: string) {
    super(
      `Account ${accountCode} is a header or inactive and cannot be posted to`,
    );
  }
}
export class JournalApprovalPendingError extends DomainError {
  readonly code = 'GL.APPROVAL_PENDING';
  constructor(
    readonly entryId: string,
    readonly requestId: string | null,
  ) {
    super(`Journal entry ${entryId} is waiting for approval`);
  }
}
export class GlVersionConflictError extends DomainError {
  readonly code = 'GL.VERSION_CONFLICT';
  constructor(
    readonly entryId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Journal entry ${entryId} was modified (expected version ${String(expected)}, found ${String(actual)})`,
    );
  }
}
export class PeriodHasUnpostedEntriesError extends DomainError {
  readonly code = 'GL.PERIOD_HAS_UNPOSTED_ENTRIES';
  constructor(
    readonly companyId: string,
    readonly from: string,
    readonly to: string,
    readonly count: number,
  ) {
    super(
      `${String(count)} journal entries between ${from} and ${to} are still unposted`,
    );
  }
}
export class FiscalPeriodNotFoundForDateError extends DomainError {
  readonly code = 'GL.PERIOD_NOT_FOUND';
  constructor(
    readonly companyId: string,
    readonly date: string,
  ) {
    super(`Company ${companyId} has no fiscal period covering ${date}`);
  }
}
/** Same code as AR/AP: the posting-date gate rejected the entry date. */
export class GlPostingPeriodClosedError extends DomainError {
  readonly code = 'FINANCE.POSTING_PERIOD_CLOSED';
  constructor(
    readonly companyId: string,
    readonly date: string,
    readonly reason: string,
  ) {
    super(`Cannot post to ${date} for company ${companyId}: ${reason}`);
  }
}
