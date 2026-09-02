import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  SalesOrderStatus,
  type DeliveryNote,
  type SalesOrder,
} from '../../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

export class OrderLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) uomCode?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) description?: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) unitPriceMinor?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DISCOUNT_BP)
  discountBp?: number;
}

export class CreateSalesOrderRequestDto {
  /** Convert an ACCEPTED quotation; companyId/customerId/lines are then taken from it. */
  @Expose() @IsOptional() @IsString() @Length(1, 36) quotationId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) companyId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
  @Expose() @IsOptional() @IsString() @Matches(CURRENCY) currency?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) orderDate?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  requestedDeliveryDate?: string;
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
  @Type(() => OrderLineRequestDto)
  lines?: OrderLineRequestDto[];
}

export class UpdateSalesOrderRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  requestedDeliveryDate?: string;
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
  @Type(() => OrderLineRequestDto)
  lines?: OrderLineRequestDto[];
}

export class OrderActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class ListSalesOrdersQueryDto {
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
  @IsIn(Object.values(SalesOrderStatus))
  status?: SalesOrderStatus;
  @Expose() @IsOptional() @IsString() @Length(1, 36) customerId?: string;
}

export class DeliveryLineRequestDto {
  @Expose() @IsString() @Length(1, 36) salesOrderLineId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
}

export class CreateDeliveryNoteRequestDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) deliveryDate?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) warehouseId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 500) shipToAddress?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  /** Omit to deliver everything outstanding. */
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineRequestDto)
  lines?: DeliveryLineRequestDto[];
}

export class DeliveryNoteActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

// ---- responses -------------------------------------------------------------

export class OrderLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() description!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() deliveredQty!: string;
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

export class SalesOrderResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() quotationId!: string | null;
  @Expose() customerId!: string;
  @Expose() currency!: string;
  @Expose() orderDate!: string;
  @Expose() requestedDeliveryDate!: string | null;
  @Expose() status!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() notes!: string | null;
  @Expose() subtotalMinor!: string;
  @Expose() discountMinor!: string;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() creditStatus!: string;
  @Expose() creditExposureMinor!: string;
  @Expose() approvalRequestId!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() submittedAt!: string | null;
  @Expose() confirmedAt!: string | null;
  @Expose() resolvedAt!: string | null;
  @Expose() cancelReason!: string | null;
  @Expose() @Type(() => OrderLineResponseDto) lines!: OrderLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class SalesOrderListResponseDto {
  @Expose() @Type(() => SalesOrderResponseDto) items!: SalesOrderResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class DeliveryNoteLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() salesOrderLineId!: string;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
}

export class DeliveryNoteResponseDto {
  @Expose() id!: string;
  @Expose() salesOrderId!: string;
  @Expose() number!: string;
  @Expose() status!: string;
  @Expose() deliveryDate!: string;
  @Expose() warehouseId!: string | null;
  @Expose() shipToAddress!: string | null;
  @Expose() notes!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() shippedAt!: string | null;
  @Expose()
  @Type(() => DeliveryNoteLineResponseDto)
  lines!: DeliveryNoteLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class DeliveryNoteListResponseDto {
  @Expose()
  @Type(() => DeliveryNoteResponseDto)
  items!: DeliveryNoteResponseDto[];
}

export function toSalesOrderDto(so: SalesOrder): SalesOrderResponseDto {
  const s = so.snapshot();
  const dto = new SalesOrderResponseDto();
  dto.id = s.id;
  dto.companyId = s.companyId;
  dto.number = s.number;
  dto.quotationId = s.quotationId;
  dto.customerId = s.customerId;
  dto.currency = s.currency;
  dto.orderDate = s.orderDate;
  dto.requestedDeliveryDate = s.requestedDeliveryDate;
  dto.status = s.status;
  dto.paymentTermsDays = s.paymentTermsDays;
  dto.notes = s.notes;
  dto.subtotalMinor = s.subtotalMinor.toString();
  dto.discountMinor = s.discountMinor.toString();
  dto.taxMinor = s.taxMinor.toString();
  dto.totalMinor = s.totalMinor.toString();
  dto.creditStatus = s.creditStatus;
  dto.creditExposureMinor = s.creditExposureMinor.toString();
  dto.approvalRequestId = s.approvalRequestId;
  dto.version = s.version;
  dto.createdBy = s.createdBy;
  dto.submittedAt = s.submittedAt?.toISOString() ?? null;
  dto.confirmedAt = s.confirmedAt?.toISOString() ?? null;
  dto.resolvedAt = s.resolvedAt?.toISOString() ?? null;
  dto.cancelReason = s.cancelReason;
  dto.lines = s.lines.map((l) => {
    const d = new OrderLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.description = l.description;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    d.deliveredQty = l.deliveredQty.toString();
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

export function toDeliveryNoteDto(n: DeliveryNote): DeliveryNoteResponseDto {
  const s = n.snapshot();
  const dto = new DeliveryNoteResponseDto();
  dto.id = s.id;
  dto.salesOrderId = s.salesOrderId;
  dto.number = s.number;
  dto.status = s.status;
  dto.deliveryDate = s.deliveryDate;
  dto.warehouseId = s.warehouseId;
  dto.shipToAddress = s.shipToAddress;
  dto.notes = s.notes;
  dto.version = s.version;
  dto.createdBy = s.createdBy;
  dto.shippedAt = s.shippedAt?.toISOString() ?? null;
  dto.lines = s.lines.map((l) => {
    const d = new DeliveryNoteLineResponseDto();
    d.id = l.id;
    d.lineNo = l.lineNo;
    d.salesOrderLineId = l.salesOrderLineId;
    d.itemId = l.itemId;
    d.itemSku = l.itemSku;
    d.uomCode = l.uomCode;
    d.quantity = l.quantity.toString();
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toLineRequest(d: OrderLineRequestDto) {
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
