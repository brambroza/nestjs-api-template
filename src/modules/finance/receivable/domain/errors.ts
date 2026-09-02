import { DomainError } from '../../../../shared/errors';

export class ArRefInvalidError extends DomainError {
  readonly code = 'AR.REF_INVALID';
}

export class InvoiceNotFoundError extends DomainError {
  readonly code = 'AR.INVOICE_NOT_FOUND';
  constructor(readonly invoiceId: string) {
    super(`Invoice ${invoiceId} not found`);
  }
}

export class IllegalInvoiceTransitionError extends DomainError {
  readonly code = 'AR.ILLEGAL_INVOICE_TRANSITION';
  constructor(
    readonly invoiceId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invoice ${invoiceId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvoiceNotEditableError extends DomainError {
  readonly code = 'AR.INVOICE_NOT_EDITABLE';
  constructor(
    readonly invoiceId: string,
    readonly status: string,
  ) {
    super(`Invoice ${invoiceId} is ${status}; only DRAFT can be edited`);
  }
}

export class InvalidInvoiceError extends DomainError {
  readonly code = 'AR.INVALID_INVOICE';
}

export class SettlementExceedsBalanceError extends DomainError {
  readonly code = 'AR.SETTLEMENT_EXCEEDS_BALANCE';
  constructor(
    readonly invoiceId: string,
    readonly balanceMinor: bigint,
    readonly amountMinor: bigint,
  ) {
    super(
      `Invoice ${invoiceId}: ${amountMinor.toString()} exceeds the open balance of ${balanceMinor.toString()}`,
    );
  }
}

export class NothingToInvoiceError extends DomainError {
  readonly code = 'AR.NOTHING_TO_INVOICE';
  constructor(readonly salesOrderId: string) {
    super(`Sales order ${salesOrderId} has no delivered, un-invoiced quantity`);
  }
}

export class ReceiptNotFoundError extends DomainError {
  readonly code = 'AR.RECEIPT_NOT_FOUND';
  constructor(readonly receiptId: string) {
    super(`Receipt ${receiptId} not found`);
  }
}

export class IllegalReceiptTransitionError extends DomainError {
  readonly code = 'AR.ILLEGAL_RECEIPT_TRANSITION';
  constructor(
    readonly receiptId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Receipt ${receiptId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvalidReceiptError extends DomainError {
  readonly code = 'AR.INVALID_RECEIPT';
}

export class ArVersionConflictError extends DomainError {
  readonly code = 'AR.VERSION_CONFLICT';
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

export class PostingPeriodClosedError extends DomainError {
  readonly code = 'FINANCE.POSTING_PERIOD_CLOSED';
  constructor(
    readonly companyId: string,
    readonly date: string,
    readonly reason: string,
  ) {
    super(`Cannot post on ${date} for company ${companyId}: ${reason}`);
  }
}

export class InvalidPromptPayError extends DomainError {
  readonly code = 'AR.INVALID_PROMPTPAY';
}
