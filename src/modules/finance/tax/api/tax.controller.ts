import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  PndReportUseCase,
  Pp30UseCase,
  VatReportUseCase,
} from '../application';
import {
  pndCsv,
  pp30Csv,
  vatReportCsv,
  type PndForm,
  type VatReportKind,
} from '../domain';

export class TaxReportQueryDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Matches(/^\d{4}-\d{2}$/) month!: string;
  @Expose() @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}
export class VatReportQueryDto extends TaxReportQueryDto {
  @Expose() @IsIn(['OUTPUT', 'INPUT']) kind!: VatReportKind;
}
export class PndReportQueryDto extends TaxReportQueryDto {
  @Expose() @IsIn(['PND3', 'PND53']) form!: PndForm;
}

interface Amountish {
  readonly [k: string]: unknown;
}
/** bigint → string, recursively, for the JSON shape. */
function plain<T>(v: T): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Amountish)) out[k] = plain(x);
    return out;
  }
  return v;
}

function sendCsv(res: Response, filename: string, csv: string): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return csv;
}

/**
 * EPIC-C.5 Revenue Department exports. `format=csv` streams a UTF-8 (BOM)
 * CSV that opens in Thai Excel and mirrors the RD attachment layouts;
 * the default JSON carries the same rows with amounts as strings.
 */
@ApiTags('finance-tax')
@ApiBearerAuth()
@Controller('tax')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TaxController {
  constructor(
    private readonly pp30: Pp30UseCase,
    private readonly vat: VatReportUseCase,
    private readonly pnd: PndReportUseCase,
  ) {}

  @Get('pp30')
  @ApiOperation({ summary: 'ภ.พ.30 monthly VAT return figures (T-360)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'TaxReport'))
  async pp30Report(
    @Query() q: TaxReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const s = await this.pp30.execute(q);
    return q.format === 'csv'
      ? sendCsv(res, `pp30-${s.month}.csv`, pp30Csv(s))
      : plain(s);
  }

  @Get('vat-report')
  @ApiOperation({ summary: 'รายงานภาษีขาย / ภาษีซื้อ (T-364)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'TaxReport'))
  async vatReport(
    @Query() q: VatReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const r = await this.vat.execute(q);
    return q.format === 'csv'
      ? sendCsv(
          res,
          `vat-${r.kind.toLowerCase()}-${r.month}.csv`,
          vatReportCsv(r),
        )
      : plain(r);
  }

  @Get('pnd')
  @ApiOperation({ summary: 'ภ.ง.ด.3 / ภ.ง.ด.53 attachment rows (T-361)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'TaxReport'))
  async pndReport(
    @Query() q: PndReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const r = await this.pnd.execute(q);
    return q.format === 'csv'
      ? sendCsv(res, `${r.form.toLowerCase()}-${r.month}.csv`, pndCsv(r))
      : plain(r);
  }
}
