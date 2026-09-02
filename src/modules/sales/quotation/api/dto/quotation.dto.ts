import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  MAX_NOTES_LENGTH,
  MAX_PAYMENT_TERMS_DAYS,
  QuotationStatus,
  type Quotation,
} from '../../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

export class QuotationLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  /** Whole units, as a decimal string. */
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) uomCode?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) description?: string;
  /** Manual price in minor units; omit to price from the price lists. */
  @Expose() @IsOptional() @IsString() @Matches(INT) unitPriceMinor?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DISCOUNT_BP)
  discountBp?: number;
}

export class CreateQuotationRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Length(1, 36) customerId!: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) quoteDate?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) validUntil?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAYMENT_TERMS_DAYS)
  paymentTermsDays?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, MAX_NOTES_LENGTH)
  notes?: string;
  @Expose()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineRequestDto)
  lines!: QuotationLineRequestDto[];
}

export class UpdateQuotationRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) validUntil?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAYMENT_TERMS_DAYS)
  paymentTermsDays?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, MAX_NOTES_LENGTH)
  notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineRequestDto)
  lines?: QuotationLineRequestDto[];
}

export class QuotationTransitionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class ReviseQuotationRequestDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) validUntil?: string;
}

export class ListQuotationsQueryDto {
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
  @IsIn(Object.values(QuotationStatus))
  status?: QuotationStatus;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
}

export class QuotationLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() description!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() unitPriceMinor!: string;
  @Expose() priceSource!: string;
  @Expose() priceListId!: string | null;
  @Expose() discountBp!: number;
  @Expose() discountMinor!: string;
  @Expose() netMinor!: string;
  @Expose() taxCodeId!: string;
  @Expose() taxCode!: string;
  @Expose() taxRateBp!: number;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
}

export class QuotationResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() revision!: number;
  @Expose() customerId!: string;
  @Expose() currency!: string;
  @Expose() quoteDate!: string;
  @Expose() validUntil!: string;
  @Expose() status!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() notes!: string | null;
  @Expose() subtotalMinor!: string;
  @Expose() discountMinor!: string;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() sentAt!: string | null;
  @Expose() resolvedAt!: string | null;
  @Expose() rejectReason!: string | null;
  @Expose() salesOrderId!: string | null;
  @Expose()
  @Type(() => QuotationLineResponseDto)
  lines!: QuotationLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class QuotationListResponseDto {
  @Expose() @Type(() => QuotationResponseDto) items!: QuotationResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toQuotationDto(q: Quotation): QuotationResponseDto {
  const s = q.snapshot();
  const dto = new QuotationResponseDto();
  dto.id = s.id;
  dto.companyId = s.companyId;
  dto.number = s.number;
  dto.revision = s.revision;
  dto.customerId = s.customerId;
  dto.currency = s.currency;
  dto.quoteDate = s.quoteDate;
  dto.validUntil = s.validUntil;
  dto.status = s.status;
  dto.paymentTermsDays = s.paymentTermsDays;
  dto.notes = s.notes;
  dto.subtotalMinor = s.subtotalMinor.toString();
  dto.discountMinor = s.discountMinor.toString();
  dto.taxMinor = s.taxMinor.toString();
  dto.totalMinor = s.totalMinor.toString();
  dto.version = s.version;
  dto.createdBy = s.createdBy;
  dto.sentAt = s.sentAt?.toISOString() ?? null;
  dto.resolvedAt = s.resolvedAt?.toISOString() ?? null;
  dto.rejectReason = s.rejectReason;
  dto.salesOrderId = s.salesOrderId;
  dto.lines = s.lines.map((l) => {
    const d = new QuotationLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.description = l.description;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    d.unitPriceMinor = l.unitPriceMinor.toString();
    d.priceSource = l.priceSource;
    d.priceListId = l.priceListId;
    d.discountBp = l.discountBp;
    d.discountMinor = l.discountMinor.toString();
    d.netMinor = l.netMinor.toString();
    d.taxCodeId = l.taxCodeId;
    d.taxCode = l.taxCode;
    d.taxRateBp = l.taxRateBp;
    d.taxMinor = l.taxMinor.toString();
    d.totalMinor = l.totalMinor.toString();
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toLineRequest(d: QuotationLineRequestDto) {
  return {
    itemId: d.itemId,
    quantity: BigInt(d.quantity),
    uomCode: d.uomCode ?? null,
    description: d.description ?? null,
    unitPriceMinor:
      d.unitPriceMinor === undefined ? null : BigInt(d.unitPriceMinor),
    discountBp: d.discountBp ?? 0,
  };
}
