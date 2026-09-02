import { Expose, Type } from 'class-transformer';

import type { Item } from '../../domain';

export class ItemResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() sku!: string;
  @Expose() name!: string;
  @Expose() description!: string | null;
  @Expose() defaultUomCode!: string;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListItemsResponseDto {
  @Expose()
  @Type(() => ItemResponseDto)
  items!: ItemResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toItemResponseDto(item: Item): ItemResponseDto {
  const s = item.snapshot();
  const dto = new ItemResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.sku = s.sku;
  dto.name = s.name;
  dto.description = s.description;
  dto.defaultUomCode = s.defaultUomCode;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
