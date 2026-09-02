import { Expose, Type } from 'class-transformer';

import type { Company } from '../../domain';

export class CompanyResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() legalName!: string;
  @Expose() taxId!: string | null;
  @Expose() baseCurrency!: string;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListCompaniesResponseDto {
  @Expose()
  @Type(() => CompanyResponseDto)
  items!: CompanyResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toCompanyResponseDto(c: Company): CompanyResponseDto {
  const s = c.snapshot();
  const dto = new CompanyResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.code = s.code;
  dto.name = s.name;
  dto.legalName = s.legalName;
  dto.taxId = s.taxId;
  dto.baseCurrency = s.baseCurrency;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
