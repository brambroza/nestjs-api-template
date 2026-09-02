import { Expose, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

import type { Bom } from '../../domain';

const INT = /^\d{1,19}$/;
const POS_INT = /^[1-9]\d{0,18}$/;

export class CreateBomComponentRequestDto {
  @Expose()
  @IsString()
  @Length(1, 36)
  componentItemId!: string;

  @Expose()
  @IsString()
  @Matches(POS_INT, { message: 'qtyPerUnit must be a positive integer string' })
  qtyPerUnit!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  qtyPerUnitUom?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(INT, { message: 'scrapBasisPoints must be an integer string' })
  scrapBasisPoints?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(POS_INT, {
    message: 'yieldBasisPoints must be a positive integer string',
  })
  yieldBasisPoints?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(POS_INT, { message: 'minPack must be a positive integer string' })
  minPack?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  minPackUom?: string;
}

export class CreateBomRequestDto {
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomComponentRequestDto)
  components!: CreateBomComponentRequestDto[];
}

export class BomComponentResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() componentItemId!: string;
  @Expose() componentSku!: string;
  @Expose() qtyPerUnit!: string;
  @Expose() qtyPerUnitUom!: string;
  @Expose() scrapBasisPoints!: string;
  @Expose() yieldBasisPoints!: string;
  @Expose() minPack!: string;
  @Expose() minPackUom!: string;
}

export class BomResponseDto {
  @Expose() id!: string;
  @Expose() itemId!: string;
  @Expose() productSku!: string;
  @Expose() version!: number;
  @Expose() name!: string | null;
  @Expose() isActive!: boolean;

  @Expose()
  @Type(() => BomComponentResponseDto)
  components!: BomComponentResponseDto[];

  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class BomListResponseDto {
  @Expose()
  @Type(() => BomResponseDto)
  items!: BomResponseDto[];
}

export function toBomResponseDto(b: Bom): BomResponseDto {
  const s = b.snapshot();
  const dto = new BomResponseDto();
  dto.id = s.id;
  dto.itemId = s.itemId;
  dto.productSku = s.productSku;
  dto.version = s.version;
  dto.name = s.name;
  dto.isActive = s.isActive;
  dto.components = s.components.map((c) => {
    const d = new BomComponentResponseDto();
    d.id = c.id;
    d.lineNo = c.lineNo;
    d.componentItemId = c.componentItemId;
    d.componentSku = c.componentSku;
    d.qtyPerUnit = c.qtyPerUnit.toString();
    d.qtyPerUnitUom = c.qtyPerUnitUom;
    d.scrapBasisPoints = c.scrapBasisPoints.toString();
    d.yieldBasisPoints = c.yieldBasisPoints.toString();
    d.minPack = c.minPack.toString();
    d.minPackUom = c.minPackUom;
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
