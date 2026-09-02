export interface ArEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly customerId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly actor: string;
}

export interface InvoiceEvent extends ArEventBase {
  readonly type:
    | 'sales_invoice.issued.v1'
    | 'sales_invoice.voided.v1'
    | 'credit_note.issued.v1'
    | 'debit_note.issued.v1';
  readonly number: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly taxMinor: bigint;
  readonly originalInvoiceId: string | null;
}

export interface ReceiptEvent extends ArEventBase {
  readonly type: 'receipt.posted.v1' | 'receipt.voided.v1';
  readonly number: string;
  readonly companyId: string;
  readonly method: string;
  readonly whtMinor: bigint;
  readonly allocations: ReadonlyArray<{
    readonly invoiceId: string;
    readonly amountMinor: bigint;
  }>;
}

export type ArEvent = InvoiceEvent | ReceiptEvent;
