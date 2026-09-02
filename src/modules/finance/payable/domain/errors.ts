import { DomainError } from '../../../../shared/errors';

export class ApRefInvalidError extends DomainError {
  readonly code = 'AP.REF_INVALID';
}
export class VendorInvoiceNotFoundError extends DomainError {
  readonly code = 'AP.INVOICE_NOT_FOUND';
  constructor(readonly invoiceId: string) {
    super(`Vendor invoice ${invoiceId} not found`);
  }
}
export class IllegalVendorInvoiceTransitionError extends DomainError {
  readonly code = 'AP.ILLEGAL_INVOICE_TRANSITION';
  constructor(
    readonly invoiceId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Vendor invoice ${invoiceId}: ${from} -> ${to} is not allowed`);
  }
}
export class InvalidVendorInvoiceError extends DomainError {
  readonly code = 'AP.INVALID_INVOICE';
}
export class MatchVarianceError extends DomainError {
  readonly code = 'AP.MATCH_VARIANCE';
  constructor(
    readonly invoiceId: string,
    readonly issues: readonly string[],
  ) {
    super(
      `Vendor invoice ${invoiceId} does not match PO/GRN: ${issues.join('; ')}`,
    );
  }
}
export class ApSettlementExceedsBalanceError extends DomainError {
  readonly code = 'AP.SETTLEMENT_EXCEEDS_BALANCE';
  constructor(
    readonly invoiceId: string,
    readonly balanceMinor: bigint,
    readonly amountMinor: bigint,
  ) {
    super(
      `Vendor invoice ${invoiceId}: ${amountMinor.toString()} exceeds the open balance of ${balanceMinor.toString()}`,
    );
  }
}
export class VoucherNotFoundError extends DomainError {
  readonly code = 'AP.VOUCHER_NOT_FOUND';
  constructor(readonly voucherId: string) {
    super(`Payment voucher ${voucherId} not found`);
  }
}
export class IllegalVoucherTransitionError extends DomainError {
  readonly code = 'AP.ILLEGAL_VOUCHER_TRANSITION';
  constructor(
    readonly voucherId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Payment voucher ${voucherId}: ${from} -> ${to} is not allowed`);
  }
}
export class InvalidVoucherError extends DomainError {
  readonly code = 'AP.INVALID_VOUCHER';
}
export class BatchNotFoundError extends DomainError {
  readonly code = 'AP.BATCH_NOT_FOUND';
  constructor(readonly batchId: string) {
    super(`Payment batch ${batchId} not found`);
  }
}
export class InvalidBatchError extends DomainError {
  readonly code = 'AP.INVALID_BATCH';
}
export class CertificateNotFoundError extends DomainError {
  readonly code = 'AP.CERTIFICATE_NOT_FOUND';
  constructor(readonly certificateId: string) {
    super(`WHT certificate ${certificateId} not found`);
  }
}
export class ApVersionConflictError extends DomainError {
  readonly code = 'AP.VERSION_CONFLICT';
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
export class ApPostingPeriodClosedError extends DomainError {
  readonly code = 'FINANCE.POSTING_PERIOD_CLOSED';
  constructor(
    readonly companyId: string,
    readonly date: string,
    readonly reason: string,
  ) {
    super(`Cannot post on ${date} for company ${companyId}: ${reason}`);
  }
}
