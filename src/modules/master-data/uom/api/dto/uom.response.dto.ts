import { Expose, Type } from 'class-transformer';

import type { UomDefinition } from '../../domain';

export class UomResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() baseUomCode!: string | null;
  @Expose() conversionRatio!: string;
}

export class ListUomsResponseDto {
  @Expose()
  @Type(() => UomResponseDto)
  items!: UomResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export function toUomResponseDto(u: UomDefinition): UomResponseDto {
  const s = u.snapshot();
  const dto = new UomResponseDto();
  dto.id = s.id;
  dto.tenantId = s.tenantId;
  dto.code = s.code;
  dto.name = s.name;
  dto.baseUomCode = s.baseUomCode;
  dto.conversionRatio = s.conversionRatio.toString();
  return dto;
}
