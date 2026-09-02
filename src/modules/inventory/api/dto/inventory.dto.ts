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
  TransferStatus,
  type CostLayerSnapshot,
  type SerialUnitSnapshot,
  type StockMovementSnapshot,
  type StockTransfer,
} from '../../domain';
import type {
  BalanceWithLot,
  LotWithStock,
} from '../../application/ports/repositories';
import type { ItemStockView } from '../../application/inventory.use-cases';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;

export class MovementLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) uomCode?: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) unitCostMinor?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 64) lotNumber?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) expiryDate?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class ManualMovementRequestDto {
  @Expose() @IsString() @Length(1, 36) warehouseId!: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
  @Expose() @IsOptional() @IsString() @Matches(REF) referenceType?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) referenceId?: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MovementLineRequestDto)
  lines!: MovementLineRequestDto[];
}

export class AdjustmentRequestDto extends ManualMovementRequestDto {
  @Expose() @IsString() @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @Expose() @IsString() @Length(1, 500) declare reason: string;
}

export class ReserveRequestDto {
  @Expose() @IsString() @Length(1, 36) warehouseId!: string;
  @Expose() @IsString() @Matches(REF) referenceType!: string;
  @Expose() @IsString() @Length(1, 36) referenceId!: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MovementLineRequestDto)
  lines!: MovementLineRequestDto[];
}

export class ReleaseRequestDto {
  @Expose() @IsString() @Matches(REF) referenceType!: string;
  @Expose() @IsString() @Length(1, 36) referenceId!: string;
}

export class TransferLineRequestDto {
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 64) lotNumber?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateTransferRequestDto {
  @Expose() @IsString() @Length(1, 36) fromWarehouseId!: string;
  @Expose() @IsString() @Length(1, 36) toWarehouseId!: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TransferLineRequestDto)
  lines!: TransferLineRequestDto[];
}

export class TransferActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class ListTransfersQueryDto {
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
  @IsIn(Object.values(TransferStatus))
  status?: TransferStatus;
}

export class ListMovementsQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 36) itemId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) warehouseId?: string;
  @Expose() @IsOptional() @IsString() @Matches(REF) referenceType?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) referenceId?: string;
}

export class WarehouseStockQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class LotsQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  expiringWithinDays?: number;
}

// ---- responses -------------------------------------------------------------

export class MovementResponseDto {
  @Expose() id!: string;
  @Expose() warehouseId!: string;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() lotId!: string | null;
  @Expose() uomCode!: string;
  @Expose() type!: string;
  @Expose() quantity!: string;
  @Expose() unitCostMinor!: string;
  @Expose() costMinor!: string;
  @Expose() currency!: string;
  @Expose() referenceType!: string;
  @Expose() referenceId!: string;
  @Expose() reason!: string | null;
  @Expose() serialNumbers!: string[];
  @Expose() occurredAt!: string;
  @Expose() createdBy!: string;
}

export class MovementListResponseDto {
  @Expose() @Type(() => MovementResponseDto) items!: MovementResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class BalanceResponseDto {
  @Expose() warehouseId!: string;
  @Expose() itemId!: string;
  @Expose() lotId!: string | null;
  @Expose() lotNumber!: string | null;
  @Expose() expiryDate!: string | null;
  @Expose() expiry?: string;
  @Expose() uomCode!: string;
  @Expose() onHandQty!: string;
  @Expose() reservedQty!: string;
  @Expose() availableQty!: string;
}

export class BalanceListResponseDto {
  @Expose() @Type(() => BalanceResponseDto) items!: BalanceResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class CostLayerResponseDto {
  @Expose() id!: string;
  @Expose() warehouseId!: string;
  @Expose() lotId!: string | null;
  @Expose() receivedAt!: string;
  @Expose() remainingQty!: string;
  @Expose() unitCostMinor!: string;
  @Expose() currency!: string;
}

export class ItemStockResponseDto {
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() itemName!: string;
  @Expose() trackingPolicy!: string;
  @Expose() uomCode!: string;
  @Expose() onHandQty!: string;
  @Expose() reservedQty!: string;
  @Expose() availableQty!: string;
  @Expose() averageUnitCostMinor!: string | null;
  @Expose() fifoValueMinor!: string;
  @Expose() @Type(() => BalanceResponseDto) balances!: BalanceResponseDto[];
  @Expose() @Type(() => CostLayerResponseDto) layers!: CostLayerResponseDto[];
}

export class LotResponseDto {
  @Expose() id!: string;
  @Expose() itemId!: string;
  @Expose() lotNumber!: string;
  @Expose() expiryDate!: string | null;
  @Expose() expiry!: string;
  @Expose() onHandQty!: string;
}

export class LotListResponseDto {
  @Expose() @Type(() => LotResponseDto) items!: LotResponseDto[];
}

export class SerialResponseDto {
  @Expose() itemId!: string;
  @Expose() serialNumber!: string;
  @Expose() warehouseId!: string | null;
  @Expose() lotId!: string | null;
  @Expose() status!: string;
  @Expose() lastMovementId!: string | null;
}

export class SerialListResponseDto {
  @Expose() @Type(() => SerialResponseDto) items!: SerialResponseDto[];
}

export class ReserveResponseDto {
  @Expose() kind!: string;
  @Expose() warehouseId!: string;
  @Expose() shortages!: Array<{
    itemId: string;
    itemSku: string;
    uomCode: string;
    requiredQty: string;
    availableQty: string;
  }>;
}

export class ReleaseResponseDto {
  @Expose() released!: number;
}

export class TransferLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() lotId!: string | null;
  @Expose() uomCode!: string;
  @Expose() quantity!: string;
  @Expose() unitCostMinor!: string;
  @Expose() serialNumbers!: string[];
}

export class TransferResponseDto {
  @Expose() id!: string;
  @Expose() number!: string;
  @Expose() fromWarehouseId!: string;
  @Expose() toWarehouseId!: string;
  @Expose() status!: string;
  @Expose() notes!: string | null;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() shippedAt!: string | null;
  @Expose() receivedAt!: string | null;
  @Expose()
  @Type(() => TransferLineResponseDto)
  lines!: TransferLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class TransferListResponseDto {
  @Expose() @Type(() => TransferResponseDto) items!: TransferResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toMovementDto(m: StockMovementSnapshot): MovementResponseDto {
  const d = new MovementResponseDto();
  d.id = m.id;
  d.warehouseId = m.warehouseId;
  d.itemId = m.itemId;
  d.itemSku = m.itemSku;
  d.lotId = m.lotId;
  d.uomCode = m.uomCode;
  d.type = m.type;
  d.quantity = m.quantity.toString();
  d.unitCostMinor = m.unitCostMinor.toString();
  d.costMinor = m.costMinor.toString();
  d.currency = m.currency;
  d.referenceType = m.referenceType;
  d.referenceId = m.referenceId;
  d.reason = m.reason;
  d.serialNumbers = [...m.serialNumbers];
  d.occurredAt = m.occurredAt.toISOString();
  d.createdBy = m.createdBy;
  return d;
}

export function toBalanceDto(
  b: BalanceWithLot & { expiry?: string },
): BalanceResponseDto {
  const d = new BalanceResponseDto();
  d.warehouseId = b.balance.warehouseId;
  d.itemId = b.balance.itemId;
  d.lotId = b.balance.lotId;
  d.lotNumber = b.lotNumber;
  d.expiryDate = b.expiryDate;
  if (b.expiry !== undefined) d.expiry = b.expiry;
  d.uomCode = b.balance.uomCode;
  d.onHandQty = b.balance.onHandQty.toString();
  d.reservedQty = b.balance.reservedQty.toString();
  d.availableQty = (b.balance.onHandQty - b.balance.reservedQty).toString();
  return d;
}

function toLayerDto(l: CostLayerSnapshot): CostLayerResponseDto {
  const d = new CostLayerResponseDto();
  d.id = l.id;
  d.warehouseId = l.warehouseId;
  d.lotId = l.lotId;
  d.receivedAt = l.receivedAt.toISOString();
  d.remainingQty = l.remainingQty.toString();
  d.unitCostMinor = l.unitCostMinor.toString();
  d.currency = l.currency;
  return d;
}

export function toItemStockDto(v: ItemStockView): ItemStockResponseDto {
  const d = new ItemStockResponseDto();
  d.itemId = v.item.id;
  d.itemSku = v.item.sku;
  d.itemName = v.item.name;
  d.trackingPolicy = v.item.trackingPolicy;
  d.uomCode = v.item.defaultUomCode;
  d.onHandQty = v.onHandQty.toString();
  d.reservedQty = v.reservedQty.toString();
  d.availableQty = v.availableQty.toString();
  d.averageUnitCostMinor = v.averageCost?.unitCostMinor.toString() ?? null;
  d.fifoValueMinor = v.fifoValueMinor.toString();
  d.balances = v.balances.map(toBalanceDto);
  d.layers = v.layers.map(toLayerDto);
  return d;
}

export function toLotDto(r: LotWithStock & { expiry: string }): LotResponseDto {
  const d = new LotResponseDto();
  d.id = r.lot.id;
  d.itemId = r.lot.itemId;
  d.lotNumber = r.lot.lotNumber;
  d.expiryDate = r.lot.expiryDate;
  d.expiry = r.expiry;
  d.onHandQty = r.onHandQty.toString();
  return d;
}

export function toSerialDto(u: SerialUnitSnapshot): SerialResponseDto {
  const d = new SerialResponseDto();
  d.itemId = u.itemId;
  d.serialNumber = u.serialNumber;
  d.warehouseId = u.warehouseId;
  d.lotId = u.lotId;
  d.status = u.status;
  d.lastMovementId = u.lastMovementId;
  return d;
}

export function toTransferDto(t: StockTransfer): TransferResponseDto {
  const s = t.snapshot();
  const d = new TransferResponseDto();
  d.id = s.id;
  d.number = s.number;
  d.fromWarehouseId = s.fromWarehouseId;
  d.toWarehouseId = s.toWarehouseId;
  d.status = s.status;
  d.notes = s.notes;
  d.version = s.version;
  d.createdBy = s.createdBy;
  d.shippedAt = s.shippedAt?.toISOString() ?? null;
  d.receivedAt = s.receivedAt?.toISOString() ?? null;
  d.lines = s.lines.map((l) => {
    const x = new TransferLineResponseDto();
    x.id = l.id;
    x.lineNo = l.lineNo;
    x.itemId = l.itemId;
    x.itemSku = l.itemSku;
    x.lotId = l.lotId;
    x.uomCode = l.uomCode;
    x.quantity = l.quantity.toString();
    x.unitCostMinor = l.unitCostMinor.toString();
    x.serialNumbers = [...l.serialNumbers];
    return x;
  });
  d.createdAt = s.createdAt.toISOString();
  d.updatedAt = s.updatedAt.toISOString();
  return d;
}

export function toLineCommand(l: MovementLineRequestDto) {
  return {
    itemId: l.itemId,
    quantity: BigInt(l.quantity),
    uomCode: l.uomCode ?? null,
    unitCostMinor:
      l.unitCostMinor === undefined ? null : BigInt(l.unitCostMinor),
    lotNumber: l.lotNumber ?? null,
    expiryDate: l.expiryDate ?? null,
    serialNumbers: l.serialNumbers ?? null,
  };
}
