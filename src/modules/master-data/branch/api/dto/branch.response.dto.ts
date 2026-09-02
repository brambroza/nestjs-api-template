import { Expose, Type } from 'class-transformer';

import type { Branch } from '../../domain';

class BranchAddressResponseDto {
  @Expose() line1!: string | null;
  @Expose() line2!: string | null;
  @Expose() subDistrict!: string | null;
  @Expose() district!: string | null;
  @Expose() province!: string | null;
  @Expose() postalCode!: string | null;
}

export class BranchResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() companyId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() branchNumber!: string;

  @Expose()
  @Type(() => BranchAddressResponseDto)
  address!: BranchAddressResponseDto;

  @Expose() isHeadOffice!: boolean;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListBranchesResponseDto {
  @Expose()
  @Type(() => BranchResponseDto)
  items!: BranchResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toBranchResponseDto(b: Branch): BranchResponseDto {
  const s = b.snapshot();
  const dto = new BranchResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.companyId = s.companyId;
  dto.code = s.code;
  dto.name = s.name;
  dto.branchNumber = s.branchNumber;
  const addr = new BranchAddressResponseDto();
  addr.line1 = s.address.line1;
  addr.line2 = s.address.line2;
  addr.subDistrict = s.address.subDistrict;
  addr.district = s.address.district;
  addr.province = s.address.province;
  addr.postalCode = s.address.postalCode;
  dto.address = addr;
  dto.isHeadOffice = s.isHeadOffice;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
