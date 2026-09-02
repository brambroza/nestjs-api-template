import { Expose, Type } from 'class-transformer';

import type { Warehouse } from '../../domain';

export class WarehouseResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() branchId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() isDefault!: boolean;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListWarehousesResponseDto {
  @Expose()
  @Type(() => WarehouseResponseDto)
  items!: WarehouseResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toWarehouseResponseDto(w: Warehouse): WarehouseResponseDto {
  const s = w.snapshot();
  const dto = new WarehouseResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.branchId = s.branchId;
  dto.code = s.code;
  dto.name = s.name;
  dto.isDefault = s.isDefault;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
