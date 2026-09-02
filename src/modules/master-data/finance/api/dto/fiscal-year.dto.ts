import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import type { FiscalYear, PostingCheck } from '../../domain';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateFiscalYearRequestDto {
  @Expose() @IsString() @Length(1, 32) name!: string;
  /** 1st of a month; the year runs 12 calendar months from here. */
  @Expose() @IsString() @Matches(ISO_DATE) startDate!: string;
}

export class PeriodActionRequestDto {
  @Expose() @IsOptional() @IsString() @Length(1, 200) reason?: string;
}

export class UnlockPeriodRequestDto {
  @Expose() @IsString() @Length(1, 200) reason!: string;
}

export class PeriodNoParamDto {
  @Expose() @Type(() => Number) @IsInt() @Min(1) @Max(12) periodNo!: number;
}

export class PostingCheckQueryDto {
  @Expose() @IsString() @Matches(ISO_DATE) date!: string;
}

export class FiscalPeriodResponseDto {
  @Expose() id!: string;
  @Expose() periodNo!: number;
  @Expose() startDate!: string;
  @Expose() endDate!: string;
  @Expose() status!: string;
  @Expose() lockedAt!: string | null;
  @Expose() lockedBy!: string | null;
  @Expose() lockReason!: string | null;
}

export class FiscalYearResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() name!: string;
  @Expose() startDate!: string;
  @Expose() endDate!: string;
  @Expose() status!: string;
  @Expose() closedAt!: string | null;
  @Expose() closedBy!: string | null;
  @Expose()
  @Type(() => FiscalPeriodResponseDto)
  periods!: FiscalPeriodResponseDto[];
}

export class FiscalYearListResponseDto {
  @Expose() @Type(() => FiscalYearResponseDto) items!: FiscalYearResponseDto[];
}

export class PostingCheckResponseDto {
  @Expose() allowed!: boolean;
  @Expose() reason!: string;
  @Expose() fiscalYearId!: string | null;
  @Expose() periodNo!: number | null;
  @Expose() periodStatus!: string | null;
}

export function toFiscalYearDto(y: FiscalYear): FiscalYearResponseDto {
  const s = y.snapshot();
  const dto = new FiscalYearResponseDto();
  dto.id = s.id;
  dto.companyId = s.companyId;
  dto.name = s.name;
  dto.startDate = s.startDate;
  dto.endDate = s.endDate;
  dto.status = s.status;
  dto.closedAt = s.closedAt?.toISOString() ?? null;
  dto.closedBy = s.closedBy;
  dto.periods = s.periods.map((p) => {
    const d = new FiscalPeriodResponseDto();
    d.id = p.id;
    d.periodNo = p.periodNo;
    d.startDate = p.startDate;
    d.endDate = p.endDate;
    d.status = p.status;
    d.lockedAt = p.lockedAt?.toISOString() ?? null;
    d.lockedBy = p.lockedBy;
    d.lockReason = p.lockReason;
    return d;
  });
  return dto;
}

export function toPostingCheckDto(c: PostingCheck): PostingCheckResponseDto {
  const dto = new PostingCheckResponseDto();
  dto.allowed = c.allowed;
  dto.reason = c.reason;
  dto.fiscalYearId = c.fiscalYearId;
  dto.periodNo = c.periodNo;
  dto.periodStatus = c.periodStatus;
  return dto;
}
