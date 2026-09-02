import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import type { ConvertedAmount, SyncFxRatesResult } from '../../application';
import { formatScaled, type Currency, type FxRate } from '../../domain';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CUR = /^[A-Za-z]{3}$/;
const DECIMAL = /^\d+(\.\d{1,6})?$/;
const INT = /^-?\d{1,19}$/;

export class CreateCurrencyRequestDto {
  @Expose()
  @IsString()
  @Matches(CUR, { message: 'code must be a 3-letter ISO 4217 code' })
  code!: string;
  @Expose() @IsString() @Length(1, 64) name!: string;
  @Expose() @IsOptional() @IsInt() @Min(0) @Max(4) minorUnits?: number;
}

export class ListCurrenciesQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class CurrencyResponseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() minorUnits!: number;
  @Expose() isActive!: boolean;
}

export class CurrencyListResponseDto {
  @Expose() @Type(() => CurrencyResponseDto) items!: CurrencyResponseDto[];
}

export function toCurrencyDto(c: Currency): CurrencyResponseDto {
  const s = c.snapshot();
  const dto = new CurrencyResponseDto();
  dto.id = s.id;
  dto.code = s.code;
  dto.name = s.name;
  dto.minorUnits = s.minorUnits;
  dto.isActive = s.isActive;
  return dto;
}

export class GetFxRateQueryDto {
  @Expose() @IsOptional() @IsString() @Matches(CUR) baseCurrency?: string;
  @Expose() @IsString() @Matches(CUR) quoteCurrency!: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) rateDate?: string;
}

export class ListFxRatesQueryDto {
  @Expose() @IsOptional() @IsString() @Matches(CUR) baseCurrency?: string;
  @Expose() @IsOptional() @IsString() @Matches(CUR) quoteCurrency?: string;
  @Expose() @IsString() @Matches(ISO_DATE) from!: string;
  @Expose() @IsString() @Matches(ISO_DATE) to!: string;
}

export class UpsertFxRateRequestDto {
  @Expose() @IsOptional() @IsString() @Matches(CUR) baseCurrency?: string;
  @Expose() @IsString() @Matches(CUR) quoteCurrency!: string;
  @Expose() @IsString() @Matches(ISO_DATE) rateDate!: string;
  /** Decimal string, up to 6 dp, e.g. "33.1234" (1 quote = rate base). */
  @Expose()
  @IsString()
  @Matches(DECIMAL, {
    message: 'rate must be a decimal string with up to 6 dp',
  })
  rate!: string;
}

export class SyncFxRatesRequestDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) rateDate?: string;
}

export class ConvertQueryDto {
  @Expose() @IsString() @Matches(INT) amountMinor!: string;
  @Expose() @IsString() @Matches(CUR) fromCurrency!: string;
  @Expose() @IsString() @Matches(CUR) toCurrency!: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) rateDate?: string;
}

export class FxRateResponseDto {
  @Expose() id!: string;
  @Expose() baseCurrency!: string;
  @Expose() quoteCurrency!: string;
  @Expose() rateDate!: string;
  @Expose() rate!: string;
  @Expose() rateScaled!: string;
  @Expose() source!: string;
  @Expose() fetchedAt!: string;
  @Expose() createdBy!: string | null;
}

export class FxRateListResponseDto {
  @Expose() @Type(() => FxRateResponseDto) items!: FxRateResponseDto[];
}

export function toFxRateDto(r: FxRate): FxRateResponseDto {
  const s = r.snapshot();
  const dto = new FxRateResponseDto();
  dto.id = s.id;
  dto.baseCurrency = s.baseCurrency;
  dto.quoteCurrency = s.quoteCurrency;
  dto.rateDate = s.rateDate;
  dto.rate = formatScaled(s.rateScaled);
  dto.rateScaled = s.rateScaled.toString();
  dto.source = s.source;
  dto.fetchedAt = s.fetchedAt.toISOString();
  dto.createdBy = s.createdBy;
  return dto;
}

export class SyncFxRatesResponseDto {
  @Expose() rateDate!: string;
  @Expose() published!: boolean;
  @Expose() tenantsProcessed!: number;
  @Expose() upserted!: number;
  @Expose() skippedManual!: number;
  @Expose() missingQuotes!: string[];
}

export function toSyncResultDto(r: SyncFxRatesResult): SyncFxRatesResponseDto {
  const dto = new SyncFxRatesResponseDto();
  dto.rateDate = r.rateDate;
  dto.published = r.published;
  dto.tenantsProcessed = r.tenantsProcessed;
  dto.upserted = r.upserted;
  dto.skippedManual = r.skippedManual;
  dto.missingQuotes = [...r.missingQuotes];
  return dto;
}

export class ConvertedAmountResponseDto {
  @Expose() amountMinor!: string;
  @Expose() fromCurrency!: string;
  @Expose() toCurrency!: string;
  @Expose() resultMinor!: string;
  @Expose() rateDate!: string;
  @Expose() @Type(() => FxRateResponseDto) ratesUsed!: FxRateResponseDto[];
}

export function toConvertedDto(c: ConvertedAmount): ConvertedAmountResponseDto {
  const dto = new ConvertedAmountResponseDto();
  dto.amountMinor = c.amountMinor.toString();
  dto.fromCurrency = c.fromCurrency;
  dto.toCurrency = c.toCurrency;
  dto.resultMinor = c.resultMinor.toString();
  dto.rateDate = c.rateDate;
  dto.ratesUsed = c.ratesUsed.map(toFxRateDto);
  return dto;
}
