import { Expose, Type } from 'class-transformer';

import type { Customer } from '../../domain';

/**
 * Every field @Expose'd on purpose — ClassSerializerInterceptor's
 * excludeAll strategy blocks anything else, so new domain fields
 * cannot leak by accident.
 */
export class CustomerResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() taxId!: string | null;
  @Expose() creditLimitSatang!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ListCustomersResponseDto {
  @Expose()
  @Type(() => CustomerResponseDto)
  items!: CustomerResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toCustomerResponseDto(c: Customer): CustomerResponseDto {
  const s = c.snapshot();
  const dto = new CustomerResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.code = s.code;
  dto.name = s.name;
  dto.taxId = s.taxId;
  dto.creditLimitSatang = s.creditLimitSatang.toString();
  dto.paymentTermsDays = s.paymentTermsDays;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
