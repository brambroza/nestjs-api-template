import type { IsoDate } from '../../../../../shared/domain';
import type {
  ApEvent,
  BatchStatus,
  PaymentBatch,
  PaymentVoucher,
  VendorInvoice,
  VendorInvoiceStatus,
  VoucherStatus,
  WhtCertificateSnapshot,
} from '../../domain';

export const VENDOR_INVOICE_REPOSITORY = Symbol('VENDOR_INVOICE_REPOSITORY');
export const PAYMENT_VOUCHER_REPOSITORY = Symbol('PAYMENT_VOUCHER_REPOSITORY');
export const PAYMENT_BATCH_REPOSITORY = Symbol('PAYMENT_BATCH_REPOSITORY');
export const WHT_CERTIFICATE_REPOSITORY = Symbol('WHT_CERTIFICATE_REPOSITORY');
export const AP_REF_LOOKUP = Symbol('AP_REF_LOOKUP');
export const AP_TAX = Symbol('AP_TAX');
export const AP_POSTING_GATE = Symbol('AP_POSTING_GATE');
export const AP_OUTBOX = Symbol('AP_OUTBOX');
export const AP_LEDGER = Symbol('AP_LEDGER');

export interface VendorInvoiceFilter {
  readonly status?: VendorInvoiceStatus | null;
  readonly vendorId?: string | null;
  readonly limit: number;
  readonly offset: number;
}
export interface VendorInvoiceRepository {
  findById(tenantId: string, id: string): Promise<VendorInvoice | null>;
  list(
    tenantId: string,
    f: VendorInvoiceFilter,
  ): Promise<{
    readonly items: readonly VendorInvoice[];
    readonly total: number;
  }>;
  /** OPEN / PARTIALLY_PAID with a balance, oldest due first. */
  listOpen(
    tenantId: string,
    vendorId: string | null,
    dueOnOrBefore: IsoDate | null,
  ): Promise<readonly VendorInvoice[]>;
  invoicedQtyByPurchaseOrderLine(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<ReadonlyMap<string, bigint>>;
  create(inv: VendorInvoice): Promise<void>;
  save(inv: VendorInvoice): Promise<VendorInvoice>;
}

export interface VoucherFilter {
  readonly status?: VoucherStatus | null;
  readonly vendorId?: string | null;
  readonly batchId?: string | null;
  readonly limit: number;
  readonly offset: number;
}
export interface PaymentVoucherRepository {
  findById(tenantId: string, id: string): Promise<PaymentVoucher | null>;
  findMany(
    tenantId: string,
    ids: readonly string[],
  ): Promise<readonly PaymentVoucher[]>;
  listForBatch(
    tenantId: string,
    batchId: string,
  ): Promise<readonly PaymentVoucher[]>;
  list(
    tenantId: string,
    f: VoucherFilter,
  ): Promise<{
    readonly items: readonly PaymentVoucher[];
    readonly total: number;
  }>;
  create(v: PaymentVoucher): Promise<void>;
  save(v: PaymentVoucher): Promise<PaymentVoucher>;
}

export interface PaymentBatchRepository {
  findById(tenantId: string, id: string): Promise<PaymentBatch | null>;
  list(
    tenantId: string,
    f: {
      readonly status?: BatchStatus | null;
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<{
    readonly items: readonly PaymentBatch[];
    readonly total: number;
  }>;
  create(b: PaymentBatch): Promise<void>;
  save(b: PaymentBatch): Promise<PaymentBatch>;
}

export interface WhtCertificateRepository {
  findById(
    tenantId: string,
    id: string,
  ): Promise<WhtCertificateSnapshot | null>;
  findByVoucher(
    tenantId: string,
    voucherId: string,
  ): Promise<WhtCertificateSnapshot | null>;
  list(
    tenantId: string,
    f: {
      readonly vendorId?: string | null;
      readonly from?: IsoDate | null;
      readonly to?: IsoDate | null;
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<{
    readonly items: readonly WhtCertificateSnapshot[];
    readonly total: number;
  }>;
  create(c: WhtCertificateSnapshot): Promise<void>;
  markVoid(tenantId: string, id: string): Promise<void>;
}

export interface CompanyRef {
  readonly id: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly baseCurrency: string;
  readonly isActive: boolean;
}
export interface VendorRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly paymentTermsDays: number;
  readonly isActive: boolean;
}
export interface ItemRef {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly defaultUomCode: string;
  readonly isActive: boolean;
}
export interface PurchaseOrderForMatching {
  readonly id: string;
  readonly number: string;
  readonly companyId: string;
  readonly vendorId: string;
  readonly currency: string;
  readonly paymentTermsDays: number;
  readonly status: string;
  readonly lines: ReadonlyArray<{
    readonly id: string;
    readonly itemId: string;
    readonly itemSku: string;
    readonly description: string;
    readonly uomCode: string;
    readonly quantity: bigint;
    readonly receivedQty: bigint;
    readonly unitPriceMinor: bigint;
    readonly discountBp: number;
    readonly taxCodeId: string;
    readonly taxCode: string;
    readonly taxRateBp: number;
  }>;
}
export interface ApRefLookup {
  findCompany(tenantId: string, id: string): Promise<CompanyRef | null>;
  findVendor(tenantId: string, id: string): Promise<VendorRef | null>;
  findItem(tenantId: string, id: string): Promise<ItemRef | null>;
  findPurchaseOrderForMatching(
    tenantId: string,
    id: string,
  ): Promise<PurchaseOrderForMatching | null>;
}

export interface VatLookupResult {
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly rateBasisPoints: number;
}
export interface WhtCodeRef {
  readonly id: string;
  readonly code: string;
  readonly rateBasisPoints: number;
  readonly pndForm: string | null;
  readonly incomeType: string | null;
}
export interface ApTax {
  resolveVat(itemId: string): Promise<VatLookupResult>;
  findWhtCode(taxCodeId: string): Promise<WhtCodeRef | null>;
}
export interface ApPostingGate {
  assertOpen(companyId: string, date: IsoDate): Promise<void>;
}
export interface ApOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: ApEvent;
}
export interface ApOutbox {
  enqueue(envelope: ApOutboxEnvelope): Promise<void>;
}

/** T-351: GL postings for AP documents, inside the same transaction. */
export interface ApLedger {
  invoicePosted(inv: VendorInvoice): Promise<void>;
  invoiceVoided(inv: VendorInvoice, date: IsoDate): Promise<void>;
  paymentPosted(v: PaymentVoucher): Promise<void>;
  paymentVoided(v: PaymentVoucher, date: IsoDate): Promise<void>;
}
