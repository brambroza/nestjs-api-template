import type { IsoDate } from '../../../../../shared/domain';
import type {
  ArEvent,
  InvoiceStatus,
  InvoiceType,
  Receipt,
  ReceiptStatus,
  SalesInvoice,
} from '../../domain';

export const SALES_INVOICE_REPOSITORY = Symbol('SALES_INVOICE_REPOSITORY');
export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY');
export const TAX_INVOICE_NUMBER_GENERATOR = Symbol(
  'TAX_INVOICE_NUMBER_GENERATOR',
);
export const AR_REF_LOOKUP = Symbol('AR_REF_LOOKUP');
export const AR_TAX = Symbol('AR_TAX');
export const AR_POSTING_GATE = Symbol('AR_POSTING_GATE');
export const AR_OUTBOX = Symbol('AR_OUTBOX');

export interface InvoiceFilter {
  readonly status?: InvoiceStatus | null;
  readonly type?: InvoiceType | null;
  readonly customerId?: string | null;
  readonly from?: IsoDate | null;
  readonly to?: IsoDate | null;
  readonly limit: number;
  readonly offset: number;
}

export interface SalesInvoiceRepository {
  findById(tenantId: string, id: string): Promise<SalesInvoice | null>;
  list(
    tenantId: string,
    f: InvoiceFilter,
  ): Promise<{
    readonly items: readonly SalesInvoice[];
    readonly total: number;
  }>;
  /** ISSUED / PARTIALLY_PAID invoices (not notes) with a balance, oldest due first. */
  listOpen(
    tenantId: string,
    customerId: string | null,
  ): Promise<readonly SalesInvoice[]>;
  /** Quantity already invoiced per sales-order line (DRAFT/ISSUED/… INVOICE rows, VOID excluded). */
  invoicedQtyBySalesOrderLine(
    tenantId: string,
    salesOrderId: string,
  ): Promise<ReadonlyMap<string, bigint>>;
  listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly SalesInvoice[]>;
  create(inv: SalesInvoice): Promise<void>;
  save(inv: SalesInvoice): Promise<SalesInvoice>;
}

export interface ReceiptFilter {
  readonly customerId?: string | null;
  readonly status?: ReceiptStatus | null;
  readonly limit: number;
  readonly offset: number;
}

export interface ReceiptRepository {
  findById(tenantId: string, id: string): Promise<Receipt | null>;
  list(
    tenantId: string,
    f: ReceiptFilter,
  ): Promise<{ readonly items: readonly Receipt[]; readonly total: number }>;
  listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly Receipt[]>;
  create(r: Receipt): Promise<void>;
  save(r: Receipt): Promise<Receipt>;
}

export type TaxDocumentKind = 'IV' | 'CN' | 'DN';

/** T-331: gapless per (branch, kind, month); claimed inside the issuing transaction. */
export interface TaxInvoiceNumberGenerator {
  next(
    tenantId: string,
    kind: TaxDocumentKind,
    branchId: string,
    branchNumber: string,
    invoiceDate: IsoDate,
  ): Promise<string>;
}

export interface CompanyRef {
  readonly id: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly baseCurrency: string;
  readonly promptPayId: string | null;
  readonly isActive: boolean;
}
export interface BranchRef {
  readonly id: string;
  readonly companyId: string;
  readonly branchNumber: string;
  readonly isActive: boolean;
}
export interface CustomerRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly paymentTermsDays: number;
  readonly isActive: boolean;
}
export interface BillingAddressRef {
  readonly text: string;
  readonly branchNumber: string | null;
}
export interface ItemRef {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly defaultUomCode: string;
  readonly isActive: boolean;
}
export interface SalesOrderForInvoicing {
  readonly id: string;
  readonly number: string;
  readonly companyId: string;
  readonly customerId: string;
  readonly currency: string;
  readonly paymentTermsDays: number;
  readonly status: string;
  readonly lines: ReadonlyArray<{
    readonly id: string;
    readonly itemId: string;
    readonly itemSku: string;
    readonly description: string;
    readonly uomCode: string;
    readonly deliveredQty: bigint;
    readonly unitPriceMinor: bigint;
    readonly priceSource: string;
    readonly priceListId: string | null;
    readonly discountBp: number;
    readonly taxCodeId: string;
    readonly taxCode: string;
    readonly taxRateBp: number;
  }>;
}

export interface ArRefLookup {
  findCompany(tenantId: string, id: string): Promise<CompanyRef | null>;
  findBranch(tenantId: string, id: string): Promise<BranchRef | null>;
  findHeadOfficeBranch(
    tenantId: string,
    companyId: string,
  ): Promise<BranchRef | null>;
  findCustomer(tenantId: string, id: string): Promise<CustomerRef | null>;
  findBillingAddress(
    tenantId: string,
    customerId: string,
  ): Promise<BillingAddressRef | null>;
  findItem(tenantId: string, id: string): Promise<ItemRef | null>;
  findSalesOrderForInvoicing(
    tenantId: string,
    id: string,
  ): Promise<SalesOrderForInvoicing | null>;
}

export interface VatLookupResult {
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly rateBasisPoints: number;
}
export interface ArTax {
  resolveVat(itemId: string): Promise<VatLookupResult>;
}

/** Wraps master-data's CheckPostingDate: throws PostingPeriodClosedError. */
export interface ArPostingGate {
  assertOpen(companyId: string, date: IsoDate): Promise<void>;
}

export interface ArOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: ArEvent;
}
export interface ArOutbox {
  enqueue(envelope: ArOutboxEnvelope): Promise<void>;
}
