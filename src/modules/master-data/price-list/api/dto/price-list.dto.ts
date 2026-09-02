import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  CURRENCIES,
  type Currency,
  type PriceList,
  type PriceListLine,
} from '../../domain';
import type { ResolvedPrice } from '../../application';

export class CreatePriceListRequestDto {
  @Expose()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code!: string;

  @Expose()
  @IsString()
  @Length(1, 200)
  name!: string;

  @Expose()
  @IsString()
  @IsIn([...CURRENCIES])
  currency!: Currency;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  customerId?: string;

  @Expose()
  @IsDateString()
  validFrom!: string;

  @Expose()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class AddPriceListLineRequestDto {
  @Expose()
  @IsString()
  @Length(1, 36)
  itemId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  uomCode?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/, {
    message: 'minQty must be a positive integer string',
  })
  minQty?: string;

  @Expose()
  @IsString()
  @Matches(/^\d{1,19}$/, {
    message: 'unitPriceSatang must be a non-negative integer string',
  })
  unitPriceSatang!: string;
}

export class ListPriceListsQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @Expose()
  @IsOptional()
  @IsString()
  customerId?: string;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class ResolvePriceQueryDto {
  @Expose()
  @IsString()
  @Length(1, 36)
  itemId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  customerId?: string;

  @Expose()
  @IsOptional()
  @IsDateString()
  date?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/, {
    message: 'quantity must be a positive integer string',
  })
  quantity?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  uomCode?: string;
}

export class PriceListResponseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() currency!: string;
  @Expose() customerId!: string | null;
  @Expose() validFrom!: string;
  @Expose() validTo!: string | null;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class PriceListLineResponseDto {
  @Expose() id!: string;
  @Expose() priceListId!: string;
  @Expose() itemId!: string;
  @Expose() uomCode!: string;
  @Expose() minQty!: string;
  @Expose() unitPriceSatang!: string;
  @Expose() createdAt!: string;
}

export class PriceListDetailResponseDto extends PriceListResponseDto {
  @Expose()
  @Type(() => PriceListLineResponseDto)
  lines!: PriceListLineResponseDto[];
}

export class ListPriceListsResponseDto {
  @Expose()
  @Type(() => PriceListResponseDto)
  items!: PriceListResponseDto[];

  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class ResolvedPriceResponseDto {
  @Expose() itemId!: string;
  @Expose() customerId!: string | null;
  @Expose() date!: string;
  @Expose() quantity!: string;
  @Expose() uomCode!: string;
  @Expose() unitPriceSatang!: string;
  @Expose() currency!: string;
  @Expose() priceListId!: string;
  @Expose() priceListCode!: string;
  @Expose() lineId!: string;
  @Expose() minQty!: string;
  @Expose() matchedBy!: string;
}

export function toPriceListResponseDto(l: PriceList): PriceListResponseDto {
  return fill(new PriceListResponseDto(), l);
}

function fill<T extends PriceListResponseDto>(dto: T, l: PriceList): T {
  const s = l.snapshot();
  dto.id = s.id;
  dto.code = s.code;
  dto.name = s.name;
  dto.currency = s.currency;
  dto.customerId = s.customerId;
  dto.validFrom = s.validFrom.toISOString();
  dto.validTo = s.validTo?.toISOString() ?? null;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toPriceListLineResponseDto(
  line: PriceListLine,
): PriceListLineResponseDto {
  const s = line.snapshot();
  const dto = new PriceListLineResponseDto();
  dto.id = s.id;
  dto.priceListId = s.priceListId;
  dto.itemId = s.itemId;
  dto.uomCode = s.uomCode;
  dto.minQty = s.minQty.toString();
  dto.unitPriceSatang = s.unitPriceSatang.toString();
  dto.createdAt = s.createdAt.toISOString();
  return dto;
}

export function toPriceListDetailResponseDto(
  l: PriceList,
  lines: readonly PriceListLine[],
): PriceListDetailResponseDto {
  const dto = fill(new PriceListDetailResponseDto(), l);
  dto.lines = lines.map(toPriceListLineResponseDto);
  return dto;
}

export function toResolvedPriceResponseDto(
  p: ResolvedPrice,
): ResolvedPriceResponseDto {
  const dto = new ResolvedPriceResponseDto();
  dto.itemId = p.itemId;
  dto.customerId = p.customerId;
  dto.date = p.date.toISOString();
  dto.quantity = p.quantity.toString();
  dto.uomCode = p.uomCode;
  dto.unitPriceSatang = p.unitPriceSatang.toString();
  dto.currency = p.currency;
  dto.priceListId = p.priceListId;
  dto.priceListCode = p.priceListCode;
  dto.lineId = p.lineId;
  dto.minQty = p.minQty.toString();
  dto.matchedBy = p.matchedBy;
  return dto;
}
