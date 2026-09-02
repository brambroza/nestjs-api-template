import { Expose, Type } from 'class-transformer';

import type { ImportReport, Item } from '../../domain';

export class ItemResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() sku!: string;
  @Expose() name!: string;
  @Expose() description!: string | null;
  @Expose() defaultUomCode!: string;
  @Expose() categoryId!: string | null;
  @Expose() trackingPolicy!: string;
  @Expose() shelfLifeDays!: number | null;
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
  dto.categoryId = s.categoryId;
  dto.trackingPolicy = s.trackingPolicy;
  dto.shelfLifeDays = s.shelfLifeDays;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

class ImportRowErrorDto {
  @Expose() rowNumber!: number;
  @Expose() sku!: string | null;
  @Expose() message!: string;
}

export class ImportItemsResponseDto {
  @Expose() outcome!: string;
  @Expose() totalRows!: number;
  @Expose() validRows!: number;
  @Expose() insertedRows!: number;

  @Expose()
  @Type(() => ImportRowErrorDto)
  errors!: ImportRowErrorDto[];
}

export function toImportItemsResponseDto(
  r: ImportReport,
): ImportItemsResponseDto {
  const dto = new ImportItemsResponseDto();
  dto.outcome = r.outcome;
  dto.totalRows = r.totalRows;
  dto.validRows = r.validRows;
  dto.insertedRows = r.insertedRows;
  dto.errors = r.errors.map((e) => {
    const d = new ImportRowErrorDto();
    d.rowNumber = e.rowNumber;
    d.sku = e.sku;
    d.message = e.message;
    return d;
  });
  return dto;
}
