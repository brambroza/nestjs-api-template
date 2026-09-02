import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MAX_DISCOUNT_BP,
  MAX_DOCUMENT_LINES,
} from '../../../../../shared/domain';
import {
  InvoiceStatus,
  InvoiceType,
  MAX_PAYMENT_TERMS_DAYS,
  NoteReason,
  ReceiptMethod,
  ReceiptStatus,
  type AgingRow,
  type Receipt,
  type SalesInvoice,
} from '../../domain';
import type { StatementLine } from '../../application';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

export class ManualLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsString() @Matches(INT) unitPriceMinor!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) uomCode?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) description?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DISCOUNT_BP)
  discountBp?: number;
}

export class OrderLinePickDto {
  @Expose() @IsString() @Length(1, 36) salesOrderLineId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
}

export class CreateInvoiceFromOrderRequestDto {
  @Expose() @IsString() @Length(1, 36) salesOrderId!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) branchId?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) invoiceDate?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => OrderLinePickDto)
  lines?: OrderLinePickDto[];
}

export class CreateManualInvoiceRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) branchId?: string;
  @Expose() @IsString() @Length(1, 36) customerId!: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) invoiceDate?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAYMENT_TERMS_DAYS)
  paymentTermsDays?: number;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => ManualLineRequestDto)
  lines!: ManualLineRequestDto[];
}

export class UpdateInvoiceRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) invoiceDate?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAYMENT_TERMS_DAYS)
  paymentTermsDays?: number;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => ManualLineRequestDto)
  lines?: ManualLineRequestDto[];
}

export class InvoiceActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class NoteLineRequestDto {
  @Expose() @IsString() @Length(1, 36) invoiceLineId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) unitPriceMinor?: string;
}

export class CreateNoteRequestDto {
  @Expose() @IsString() @IsIn(Object.values(NoteReason)) reason!: NoteReason;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reasonText?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) noteDate?: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => NoteLineRequestDto)
  lines!: NoteLineRequestDto[];
}

export class ListInvoicesQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(InvoiceStatus))
  status?: InvoiceStatus;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(InvoiceType))
  type?: InvoiceType;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) from?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) to?: string;
}

export class AllocationRequestDto {
  @Expose() @IsString() @Length(1, 36) invoiceId!: string;
  @Expose() @IsString() @Matches(INT) amountMinor!: string;
}

export class CreateReceiptRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Length(1, 36) customerId!: string;
  @Expose()
  @IsString()
  @IsIn(Object.values(ReceiptMethod))
  method!: ReceiptMethod;
  @Expose() @IsString() @Matches(INT) amountMinor!: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) whtMinor?: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) receiptDate?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 100) reference?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 32) chequeNumber?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 100) chequeBank?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) chequeDate?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AllocationRequestDto)
  allocations?: AllocationRequestDto[];
  @Expose() @IsOptional() @IsBoolean() autoMatch?: boolean;
}

export class ReceiptActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class ListReceiptsQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(ReceiptStatus))
  status?: ReceiptStatus;
}

export class AutoMatchRequestDto {
  @Expose() @IsString() @Length(1, 36) customerId!: string;
  @Expose() @IsString() @Matches(INT) settlementMinor!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 100) reference?: string;
}

export class AgingQueryDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) asOf?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
}

export class StatementQueryDto {
  @Expose() @IsString() @Matches(ISO_DATE) from!: string;
  @Expose() @IsString() @Matches(ISO_DATE) to!: string;
}

// ---- responses -------------------------------------------------------------

export class InvoiceLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() description!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() unitPriceMinor!: string;
  @Expose() discountBp!: number;
  @Expose() discountMinor!: string;
  @Expose() netMinor!: string;
  @Expose() taxCode!: string;
  @Expose() taxRateBp!: number;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() salesOrderLineId!: string | null;
}

export class InvoiceResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() branchId!: string;
  @Expose() number!: string | null;
  @Expose() type!: string;
  @Expose() originalInvoiceId!: string | null;
  @Expose() reason!: string | null;
  @Expose() reasonText!: string | null;
  @Expose() customerId!: string;
  @Expose() customerName!: string;
  @Expose() customerTaxId!: string | null;
  @Expose() customerBranchNumber!: string | null;
  @Expose() billingAddress!: string | null;
  @Expose() salesOrderId!: string | null;
  @Expose() currency!: string;
  @Expose() invoiceDate!: string;
  @Expose() dueDate!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() status!: string;
  @Expose() subtotalMinor!: string;
  @Expose() discountMinor!: string;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() settledMinor!: string;
  @Expose() balanceMinor!: string;
  @Expose() notes!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() issuedAt!: string | null;
  @Expose() voidedAt!: string | null;
  @Expose() voidReason!: string | null;
  @Expose()
  @Type(() => InvoiceLineResponseDto)
  lines!: InvoiceLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class InvoiceListResponseDto {
  @Expose() @Type(() => InvoiceResponseDto) items!: InvoiceResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class PromptPayResponseDto {
  @Expose() payload!: string;
  @Expose() amountMinor!: string;
  @Expose() proxy!: string;
}

export class AllocationResponseDto {
  @Expose() id!: string;
  @Expose() invoiceId!: string;
  @Expose() amountMinor!: string;
}

export class ReceiptResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() customerId!: string;
  @Expose() currency!: string;
  @Expose() receiptDate!: string;
  @Expose() method!: string;
  @Expose() amountMinor!: string;
  @Expose() whtMinor!: string;
  @Expose() settlementMinor!: string;
  @Expose() unappliedMinor!: string;
  @Expose() reference!: string | null;
  @Expose() chequeNumber!: string | null;
  @Expose() chequeBank!: string | null;
  @Expose() chequeDate!: string | null;
  @Expose() notes!: string | null;
  @Expose() status!: string;
  @Expose()
  @Type(() => AllocationResponseDto)
  allocations!: AllocationResponseDto[];
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() postedAt!: string | null;
  @Expose() voidedAt!: string | null;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ReceiptListResponseDto {
  @Expose() @Type(() => ReceiptResponseDto) items!: ReceiptResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class MatchProposalResponseDto {
  @Expose() allocations!: Array<{
    invoiceId: string;
    amountMinor: string;
    rule: string;
  }>;
  @Expose() unappliedMinor!: string;
}

export class AgingRowResponseDto {
  @Expose() customerId!: string;
  @Expose() buckets!: Record<string, string>;
  @Expose() totalMinor!: string;
  @Expose() openInvoices!: number;
}

export class AgingResponseDto {
  @Expose() asOf!: string;
  @Expose() totalMinor!: string;
  @Expose() @Type(() => AgingRowResponseDto) rows!: AgingRowResponseDto[];
}

export class StatementLineResponseDto {
  @Expose() date!: string;
  @Expose() kind!: string;
  @Expose() documentId!: string;
  @Expose() number!: string;
  @Expose() debitMinor!: string;
  @Expose() creditMinor!: string;
  @Expose() runningBalanceMinor!: string;
}

export class StatementResponseDto {
  @Expose() customerId!: string;
  @Expose() from!: string;
  @Expose() to!: string;
  @Expose() closingBalanceMinor!: string;
  @Expose()
  @Type(() => StatementLineResponseDto)
  lines!: StatementLineResponseDto[];
}

export function toInvoiceDto(inv: SalesInvoice): InvoiceResponseDto {
  const s = inv.snapshot();
  const d = new InvoiceResponseDto();
  Object.assign(d, {
    id: s.id,
    companyId: s.companyId,
    branchId: s.branchId,
    number: s.number,
    type: s.type,
    originalInvoiceId: s.originalInvoiceId,
    reason: s.reason,
    reasonText: s.reasonText,
    customerId: s.customerId,
    customerName: s.customerName,
    customerTaxId: s.customerTaxId,
    customerBranchNumber: s.customerBranchNumber,
    billingAddress: s.billingAddress,
    salesOrderId: s.salesOrderId,
    currency: s.currency,
    invoiceDate: s.invoiceDate,
    dueDate: s.dueDate,
    paymentTermsDays: s.paymentTermsDays,
    status: s.status,
    subtotalMinor: s.subtotalMinor.toString(),
    discountMinor: s.discountMinor.toString(),
    taxMinor: s.taxMinor.toString(),
    totalMinor: s.totalMinor.toString(),
    settledMinor: s.settledMinor.toString(),
    balanceMinor: s.balanceMinor.toString(),
    notes: s.notes,
    version: s.version,
    createdBy: s.createdBy,
    issuedAt: s.issuedAt?.toISOString() ?? null,
    voidedAt: s.voidedAt?.toISOString() ?? null,
    voidReason: s.voidReason,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  });
  d.lines = s.lines.map((l) => {
    const x = new InvoiceLineResponseDto();
    Object.assign(x, {
      id: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      itemSku: l.itemSku,
      description: l.description,
      uomCode: l.uomCode,
      quantity: l.quantity.toString(),
      unitPriceMinor: l.unitPriceMinor.toString(),
      discountBp: l.discountBp,
      discountMinor: l.discountMinor.toString(),
      netMinor: l.netMinor.toString(),
      taxCode: l.taxCode,
      taxRateBp: l.taxRateBp,
      taxMinor: l.taxMinor.toString(),
      totalMinor: l.totalMinor.toString(),
      salesOrderLineId: l.salesOrderLineId,
    });
    return x;
  });
  return d;
}

export function toReceiptDto(r: Receipt): ReceiptResponseDto {
  const s = r.snapshot();
  const d = new ReceiptResponseDto();
  Object.assign(d, {
    id: s.id,
    companyId: s.companyId,
    number: s.number,
    customerId: s.customerId,
    currency: s.currency,
    receiptDate: s.receiptDate,
    method: s.method,
    amountMinor: s.amountMinor.toString(),
    whtMinor: s.whtMinor.toString(),
    settlementMinor: r.settlementMinor.toString(),
    unappliedMinor: r.unappliedMinor.toString(),
    reference: s.reference,
    chequeNumber: s.chequeNumber,
    chequeBank: s.chequeBank,
    chequeDate: s.chequeDate,
    notes: s.notes,
    status: s.status,
    version: s.version,
    createdBy: s.createdBy,
    postedAt: s.postedAt?.toISOString() ?? null,
    voidedAt: s.voidedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  });
  d.allocations = s.allocations.map((a) => {
    const x = new AllocationResponseDto();
    x.id = a.id;
    x.invoiceId = a.invoiceId;
    x.amountMinor = a.amountMinor.toString();
    return x;
  });
  return d;
}

export function toAgingRowDto(r: AgingRow): AgingRowResponseDto {
  const d = new AgingRowResponseDto();
  d.customerId = r.customerId;
  d.buckets = Object.fromEntries(
    Object.entries(r.buckets).map(([k, v]) => [k, v.toString()]),
  );
  d.totalMinor = r.totalMinor.toString();
  d.openInvoices = r.openInvoices;
  return d;
}

export function toStatementLineDto(l: StatementLine): StatementLineResponseDto {
  const d = new StatementLineResponseDto();
  Object.assign(d, {
    date: l.date,
    kind: l.kind,
    documentId: l.documentId,
    number: l.number,
    debitMinor: l.debitMinor.toString(),
    creditMinor: l.creditMinor.toString(),
    runningBalanceMinor: l.runningBalanceMinor.toString(),
  });
  return d;
}

export function toManualLine(l: ManualLineRequestDto) {
  return {
    itemId: l.itemId,
    quantity: BigInt(l.quantity),
    unitPriceMinor: BigInt(l.unitPriceMinor),
    uomCode: l.uomCode ?? null,
    description: l.description ?? null,
    discountBp: l.discountBp ?? 0,
  };
}
