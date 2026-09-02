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
import { Transform } from 'class-transformer';

import {
  MAX_DISCOUNT_BP,
  MAX_DOCUMENT_LINES,
} from '../../../../../shared/domain';
import {
  GoodsReceiptStatus,
  MAX_NOTES_LENGTH,
  MAX_PAYMENT_TERMS_DAYS,
  MAX_PURPOSE_LENGTH,
  MAX_REQUISITION_LINES,
  PurchaseOrderStatus,
  RequisitionStatus,
  type GoodsReceipt,
  type PurchaseOrder,
  type PurchaseRequisition,
} from '../../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

// ---- requisition -----------------------------------------------------------

export class RequisitionLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) uomCode?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) description?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(INT)
  estimatedUnitPriceMinor?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) suggestedVendorId?: string;
}

export class CreateRequisitionRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) neededByDate?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, MAX_PURPOSE_LENGTH)
  purpose?: string;
  @Expose()
  @IsArray()
  @ArrayMaxSize(MAX_REQUISITION_LINES)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineRequestDto)
  lines!: RequisitionLineRequestDto[];
}

export class UpdateRequisitionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) neededByDate?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, MAX_PURPOSE_LENGTH)
  purpose?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REQUISITION_LINES)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineRequestDto)
  lines?: RequisitionLineRequestDto[];
}

export class ListRequisitionsQueryDto {
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
  @IsIn(Object.values(RequisitionStatus))
  status?: RequisitionStatus;
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}

// ---- purchase order --------------------------------------------------------

export class PurchaseLineRequestDto {
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

export class CreatePurchaseOrderRequestDto {
  @Expose() @IsOptional() @IsString() @Length(1, 36) requisitionId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) companyId?: string;
  @Expose() @IsString() @Length(1, 36) vendorId!: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) orderDate?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) expectedDate?: string;
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
  @Type(() => PurchaseLineRequestDto)
  lines?: PurchaseLineRequestDto[];
}

export class UpdatePurchaseOrderRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) expectedDate?: string;
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
  @Type(() => PurchaseLineRequestDto)
  lines?: PurchaseLineRequestDto[];
}

export class ListPurchaseOrdersQueryDto {
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
  @IsIn(Object.values(PurchaseOrderStatus))
  status?: PurchaseOrderStatus;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
}

export class DocumentActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

// ---- goods receipt ---------------------------------------------------------

export class ReceiptLineRequestDto {
  @Expose() @IsString() @Length(1, 36) purchaseOrderLineId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 64) lotNumber?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) expiryDate?: string;
}

export class CreateGoodsReceiptRequestDto {
  @Expose() @IsString() @Length(1, 36) warehouseId!: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) receiptDate?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 64) vendorDeliveryRef?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, MAX_NOTES_LENGTH)
  notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineRequestDto)
  lines?: ReceiptLineRequestDto[];
}

// ---- responses -------------------------------------------------------------

export class RequisitionLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() description!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() estimatedUnitPriceMinor!: string;
  @Expose() estimatedTotalMinor!: string;
  @Expose() suggestedVendorId!: string | null;
}

export class RequisitionResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() requesterId!: string;
  @Expose() neededByDate!: string | null;
  @Expose() purpose!: string | null;
  @Expose() status!: string;
  @Expose() currency!: string;
  @Expose() estimatedTotalMinor!: string;
  @Expose() approvalRequestId!: string | null;
  @Expose() purchaseOrderId!: string | null;
  @Expose() version!: number;
  @Expose() submittedAt!: string | null;
  @Expose() resolvedAt!: string | null;
  @Expose()
  @Type(() => RequisitionLineResponseDto)
  lines!: RequisitionLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class RequisitionListResponseDto {
  @Expose()
  @Type(() => RequisitionResponseDto)
  items!: RequisitionResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class PurchaseLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() description!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() receivedQty!: string;
  @Expose() unitPriceMinor!: string;
  @Expose() priceSource!: string;
  @Expose() discountBp!: number;
  @Expose() discountMinor!: string;
  @Expose() netMinor!: string;
  @Expose() taxCodeId!: string;
  @Expose() taxCode!: string;
  @Expose() taxRateBp!: number;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
}

export class PurchaseOrderResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() requisitionId!: string | null;
  @Expose() vendorId!: string;
  @Expose() currency!: string;
  @Expose() orderDate!: string;
  @Expose() expectedDate!: string | null;
  @Expose() status!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() notes!: string | null;
  @Expose() subtotalMinor!: string;
  @Expose() discountMinor!: string;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() approvalRequestId!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() submittedAt!: string | null;
  @Expose() issuedAt!: string | null;
  @Expose() resolvedAt!: string | null;
  @Expose() cancelReason!: string | null;
  @Expose()
  @Type(() => PurchaseLineResponseDto)
  lines!: PurchaseLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class PurchaseOrderListResponseDto {
  @Expose()
  @Type(() => PurchaseOrderResponseDto)
  items!: PurchaseOrderResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class GoodsReceiptLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() purchaseOrderLineId!: string;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() lotNumber!: string | null;
  @Expose() expiryDate!: string | null;
}

export class GoodsReceiptResponseDto {
  @Expose() id!: string;
  @Expose() purchaseOrderId!: string;
  @Expose() number!: string;
  @Expose() status!: string;
  @Expose() receiptDate!: string;
  @Expose() warehouseId!: string;
  @Expose() vendorDeliveryRef!: string | null;
  @Expose() notes!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() postedAt!: string | null;
  @Expose()
  @Type(() => GoodsReceiptLineResponseDto)
  lines!: GoodsReceiptLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class GoodsReceiptListResponseDto {
  @Expose()
  @Type(() => GoodsReceiptResponseDto)
  items!: GoodsReceiptResponseDto[];
}

export function toRequisitionDto(
  pr: PurchaseRequisition,
): RequisitionResponseDto {
  const s = pr.snapshot();
  const dto = new RequisitionResponseDto();
  dto.id = s.id;
  dto.companyId = s.companyId;
  dto.number = s.number;
  dto.requesterId = s.requesterId;
  dto.neededByDate = s.neededByDate;
  dto.purpose = s.purpose;
  dto.status = s.status;
  dto.currency = s.currency;
  dto.estimatedTotalMinor = s.estimatedTotalMinor.toString();
  dto.approvalRequestId = s.approvalRequestId;
  dto.purchaseOrderId = s.purchaseOrderId;
  dto.version = s.version;
  dto.submittedAt = s.submittedAt?.toISOString() ?? null;
  dto.resolvedAt = s.resolvedAt?.toISOString() ?? null;
  dto.lines = s.lines.map((l) => {
    const d = new RequisitionLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.description = l.description;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    d.estimatedUnitPriceMinor = l.estimatedUnitPriceMinor.toString();
    d.estimatedTotalMinor = l.estimatedTotalMinor.toString();
    d.suggestedVendorId = l.suggestedVendorId;
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toPurchaseOrderDto(
  po: PurchaseOrder,
): PurchaseOrderResponseDto {
  const s = po.snapshot();
  const dto = new PurchaseOrderResponseDto();
  dto.id = s.id;
  dto.companyId = s.companyId;
  dto.number = s.number;
  dto.requisitionId = s.requisitionId;
  dto.vendorId = s.vendorId;
  dto.currency = s.currency;
  dto.orderDate = s.orderDate;
  dto.expectedDate = s.expectedDate;
  dto.status = s.status;
  dto.paymentTermsDays = s.paymentTermsDays;
  dto.notes = s.notes;
  dto.subtotalMinor = s.subtotalMinor.toString();
  dto.discountMinor = s.discountMinor.toString();
  dto.taxMinor = s.taxMinor.toString();
  dto.totalMinor = s.totalMinor.toString();
  dto.approvalRequestId = s.approvalRequestId;
  dto.version = s.version;
  dto.createdBy = s.createdBy;
  dto.submittedAt = s.submittedAt?.toISOString() ?? null;
  dto.issuedAt = s.issuedAt?.toISOString() ?? null;
  dto.resolvedAt = s.resolvedAt?.toISOString() ?? null;
  dto.cancelReason = s.cancelReason;
  dto.lines = s.lines.map((l) => {
    const d = new PurchaseLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.description = l.description;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    d.receivedQty = l.receivedQty.toString();
    d.unitPriceMinor = l.unitPriceMinor.toString();
    d.priceSource = l.priceSource;
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

export function toGoodsReceiptDto(g: GoodsReceipt): GoodsReceiptResponseDto {
  const s = g.snapshot();
  const dto = new GoodsReceiptResponseDto();
  dto.id = s.id;
  dto.purchaseOrderId = s.purchaseOrderId;
  dto.number = s.number;
  dto.status = s.status;
  dto.receiptDate = s.receiptDate;
  dto.warehouseId = s.warehouseId;
  dto.vendorDeliveryRef = s.vendorDeliveryRef;
  dto.notes = s.notes;
  dto.version = s.version;
  dto.createdBy = s.createdBy;
  dto.postedAt = s.postedAt?.toISOString() ?? null;
  dto.lines = s.lines.map((l) => {
    const d = new GoodsReceiptLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.purchaseOrderLineId = l.purchaseOrderLineId;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    d.lotNumber = l.lotNumber;
    d.expiryDate = l.expiryDate;
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toRequisitionLineRequest(d: RequisitionLineRequestDto) {
  return {
    itemId: d.itemId,
    quantity: BigInt(d.quantity),
    uomCode: d.uomCode ?? null,
    description: d.description ?? null,
    estimatedUnitPriceMinor:
      d.estimatedUnitPriceMinor === undefined
        ? null
        : BigInt(d.estimatedUnitPriceMinor),
    suggestedVendorId: d.suggestedVendorId ?? null,
  };
}

export function toPurchaseLineRequest(d: PurchaseLineRequestDto) {
  return {
    itemId: d.itemId,
    quantity: BigInt(d.quantity),
    unitPriceMinor: BigInt(d.unitPriceMinor),
    uomCode: d.uomCode ?? null,
    description: d.description ?? null,
    discountBp: d.discountBp ?? 0,
  };
}

export const GOODS_RECEIPT_STATUSES = Object.values(GoodsReceiptStatus);
