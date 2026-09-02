import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import type { ResolvedTax } from '../../application';
import {
  PndForm,
  TaxKind,
  VatTreatment,
  type ItemTaxOverrideSnapshot,
  type TaxCode,
} from '../../domain';

const INT = /^\d{1,19}$/;

export class CreateTaxCodeRequestDto {
  @Expose()
  @IsString()
  @Length(1, 16)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;
  @Expose() @IsString() @Length(1, 100) name!: string;
  @Expose() @IsString() @IsIn(Object.values(TaxKind)) kind!: TaxKind;
  /** Basis points as a string: 700 = 7 %. */
  @Expose() @IsString() @Matches(INT) rateBasisPoints!: string;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(VatTreatment))
  vatTreatment?: VatTreatment;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(PndForm))
  pndForm?: PndForm;
  @Expose() @IsOptional() @IsString() @Length(1, 100) whtIncomeType?: string;
  @Expose() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class ListTaxCodesQueryDto {
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(TaxKind))
  kind?: TaxKind;
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class SetItemTaxOverrideRequestDto {
  @Expose() @IsString() @IsIn(Object.values(TaxKind)) kind!: TaxKind;
  @Expose() @IsString() @Length(1, 36) taxCodeId!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) reason?: string;
}

export class ResolveTaxQueryDto {
  @Expose() @IsString() @IsIn(Object.values(TaxKind)) kind!: TaxKind;
  @Expose() @IsOptional() @IsString() @Length(1, 36) itemId?: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) baseAmountMinor?: string;
}

export class TaxCodeResponseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() kind!: string;
  @Expose() rateBasisPoints!: string;
  @Expose() vatTreatment!: string | null;
  @Expose() pndForm!: string | null;
  @Expose() whtIncomeType!: string | null;
  @Expose() isDefault!: boolean;
  @Expose() isActive!: boolean;
}

export class TaxCodeListResponseDto {
  @Expose() @Type(() => TaxCodeResponseDto) items!: TaxCodeResponseDto[];
}

export function toTaxCodeDto(t: TaxCode): TaxCodeResponseDto {
  const s = t.snapshot();
  const dto = new TaxCodeResponseDto();
  dto.id = s.id;
  dto.code = s.code;
  dto.name = s.name;
  dto.kind = s.kind;
  dto.rateBasisPoints = s.rateBasisPoints.toString();
  dto.vatTreatment = s.vatTreatment;
  dto.pndForm = s.pndForm;
  dto.whtIncomeType = s.whtIncomeType;
  dto.isDefault = s.isDefault;
  dto.isActive = s.isActive;
  return dto;
}

export class ItemTaxOverrideResponseDto {
  @Expose() id!: string;
  @Expose() itemId!: string;
  @Expose() kind!: string;
  @Expose() taxCodeId!: string;
  @Expose() reason!: string | null;
  @Expose() createdAt!: string;
}

export function toOverrideDto(
  o: ItemTaxOverrideSnapshot,
): ItemTaxOverrideResponseDto {
  const dto = new ItemTaxOverrideResponseDto();
  dto.id = o.id;
  dto.itemId = o.itemId;
  dto.kind = o.kind;
  dto.taxCodeId = o.taxCodeId;
  dto.reason = o.reason;
  dto.createdAt = o.createdAt.toISOString();
  return dto;
}

export class ResolvedTaxResponseDto {
  @Expose() @Type(() => TaxCodeResponseDto) taxCode!: TaxCodeResponseDto;
  @Expose() source!: string;
  @Expose() baseAmountMinor!: string | null;
  @Expose() taxMinor!: string | null;
}

export function toResolvedTaxDto(r: ResolvedTax): ResolvedTaxResponseDto {
  const dto = new ResolvedTaxResponseDto();
  dto.taxCode = toTaxCodeDto(r.taxCode);
  dto.source = r.source;
  dto.baseAmountMinor = r.baseAmountMinor?.toString() ?? null;
  dto.taxMinor = r.taxMinor?.toString() ?? null;
  return dto;
}
