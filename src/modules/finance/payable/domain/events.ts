export interface ApEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly companyId: string;
  readonly vendorId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly actor: string;
}
export interface VendorInvoiceEvent extends ApEventBase {
  readonly type: 'vendor_invoice.posted.v1' | 'vendor_invoice.voided.v1';
  readonly number: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly taxMinor: bigint;
  readonly matchStatus: string;
}
export interface PaymentEvent extends ApEventBase {
  readonly type: 'payment_voucher.posted.v1' | 'payment_voucher.voided.v1';
  readonly number: string;
  readonly method: string;
  readonly whtMinor: bigint;
  readonly netPaidMinor: bigint;
  readonly allocations: ReadonlyArray<{
    readonly invoiceId: string;
    readonly amountMinor: bigint;
    readonly whtMinor: bigint;
  }>;
}
export type ApEvent = VendorInvoiceEvent | PaymentEvent;
