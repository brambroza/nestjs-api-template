import { Expose, Type } from 'class-transformer';

import type { Vendor } from '../../domain';

export class VendorResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() taxId!: string | null;
  @Expose() paymentTermsDays!: number;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListVendorsResponseDto {
  @Expose()
  @Type(() => VendorResponseDto)
  items!: VendorResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toVendorResponseDto(v: Vendor): VendorResponseDto {
  const s = v.snapshot();
  const dto = new VendorResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.code = s.code;
  dto.name = s.name;
  dto.taxId = s.taxId;
  dto.paymentTermsDays = s.paymentTermsDays;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
