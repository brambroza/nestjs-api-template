import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  BalanceSheetUseCase,
  CloseFiscalYearUseCase,
  ClosePeriodUseCase,
  ListAccountMappingsUseCase,
  ProfitAndLossUseCase,
  TrialBalanceUseCase,
  UpsertAccountMappingUseCase,
} from '../application';
import type { StatementSection } from '../domain';

import { JournalEntryResponseDto } from './journal.controller';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CompanyQueryDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
}
export class RangeQueryDto extends CompanyQueryDto {
  @Expose() @IsString() @Matches(ISO_DATE) from!: string;
  @Expose() @IsString() @Matches(ISO_DATE) to!: string;
}
export class AsOfQueryDto extends CompanyQueryDto {
  @Expose() @IsString() @Matches(ISO_DATE) asOf!: string;
}
export class UpsertMappingRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Length(1, 32) key!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) accountId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) accountCode?: string;
}
export class ClosePeriodRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Matches(ISO_DATE) date!: string;
}

export class AccountMappingResponseDto {
  @Expose() key!: string;
  @Expose() accountId!: string;
  @Expose() accountCode!: string;
  @Expose() updatedBy!: string;
  @Expose() updatedAt!: string;
}
export class AccountMappingsResponseDto {
  @Expose() companyId!: string;
  @Expose() mappings!: AccountMappingResponseDto[];
  @Expose() missingKeys!: string[];
}

export interface StatementRowView {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh: string | null;
  readonly amountMinor: string;
}
export interface StatementSectionView {
  readonly rows: readonly StatementRowView[];
  readonly totalMinor: string;
}
function sectionView(s: StatementSection): StatementSectionView {
  return {
    rows: s.rows.map((r) => ({ ...r, amountMinor: r.amountMinor.toString() })),
    totalMinor: s.totalMinor.toString(),
  };
}

export class TrialBalanceResponseDto {
  @Expose() from!: string;
  @Expose() to!: string;
  @Expose() rows!: Array<{
    accountId: string;
    code: string;
    name: string;
    nameTh: string | null;
    type: string;
    openingMinor: string;
    debitMinor: string;
    creditMinor: string;
    closingMinor: string;
  }>;
  @Expose() totalDebitMinor!: string;
  @Expose() totalCreditMinor!: string;
  @Expose() totalClosingDebitMinor!: string;
  @Expose() totalClosingCreditMinor!: string;
  @Expose() balanced!: boolean;
}
export class ProfitAndLossResponseDto {
  @Expose() from!: string;
  @Expose() to!: string;
  @Expose() revenue!: StatementSectionView;
  @Expose() expenses!: StatementSectionView;
  @Expose() netProfitMinor!: string;
}
export class BalanceSheetResponseDto {
  @Expose() asOf!: string;
  @Expose() assets!: StatementSectionView;
  @Expose() liabilities!: StatementSectionView;
  @Expose() equity!: StatementSectionView;
  @Expose() currentEarningsMinor!: string;
  @Expose() totalAssetsMinor!: string;
  @Expose() totalLiabilitiesAndEquityMinor!: string;
  @Expose() balanced!: boolean;
}
export class PeriodCloseResponseDto {
  @Expose() fiscalYearId!: string;
  @Expose() periodNo!: number;
  @Expose() startDate!: string;
  @Expose() endDate!: string;
  @Expose() status!: string;
}
export class YearCloseResponseDto {
  @Expose() fiscalYearId!: string;
  @Expose() closingEntry!: JournalEntryResponseDto | null;
}

@ApiTags('finance-gl')
@ApiBearerAuth()
@Controller('gl')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class LedgerController {
  constructor(
    private readonly listMappings: ListAccountMappingsUseCase,
    private readonly upsertMapping: UpsertAccountMappingUseCase,
    private readonly trialBalance: TrialBalanceUseCase,
    private readonly profitAndLoss: ProfitAndLossUseCase,
    private readonly balanceSheet: BalanceSheetUseCase,
    private readonly closePeriod: ClosePeriodUseCase,
    private readonly closeYear: CloseFiscalYearUseCase,
  ) {}

  @Get('account-mappings')
  @ApiOperation({
    summary: 'Posting-key → account mapping per company (T-351)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'Account'))
  async mappings(
    @Query() q: CompanyQueryDto,
  ): Promise<AccountMappingsResponseDto> {
    const r = await this.listMappings.execute(q.companyId);
    const dto = new AccountMappingsResponseDto();
    dto.companyId = r.companyId;
    dto.mappings = r.mappings.map((m) => ({
      key: m.key,
      accountId: m.accountId,
      accountCode: m.accountCode,
      updatedBy: m.updatedBy,
      updatedAt: m.updatedAt.toISOString(),
    }));
    dto.missingKeys = [...r.missingKeys];
    return dto;
  }

  @Put('account-mappings')
  @ApiOperation({ summary: 'Set the account behind a posting key' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'Account'))
  async setMapping(
    @Body() body: UpsertMappingRequestDto,
  ): Promise<AccountMappingResponseDto> {
    const m = await this.upsertMapping.execute({
      companyId: body.companyId,
      key: body.key,
      accountId: body.accountId ?? null,
      accountCode: body.accountCode ?? null,
    });
    return {
      key: m.key,
      accountId: m.accountId,
      accountCode: m.accountCode,
      updatedBy: m.updatedBy,
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  @Get('trial-balance')
  @ApiOperation({ summary: 'Trial balance for a date range (T-353)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'LedgerReport'))
  async trialBalanceReport(
    @Query() q: RangeQueryDto,
  ): Promise<TrialBalanceResponseDto> {
    const r = await this.trialBalance.execute(q);
    const dto = new TrialBalanceResponseDto();
    dto.from = r.from;
    dto.to = r.to;
    dto.rows = r.rows.map((row) => ({
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      nameTh: row.nameTh,
      type: row.type,
      openingMinor: row.openingMinor.toString(),
      debitMinor: row.debitMinor.toString(),
      creditMinor: row.creditMinor.toString(),
      closingMinor: row.closingMinor.toString(),
    }));
    dto.totalDebitMinor = r.totalDebitMinor.toString();
    dto.totalCreditMinor = r.totalCreditMinor.toString();
    dto.totalClosingDebitMinor = r.totalClosingDebitMinor.toString();
    dto.totalClosingCreditMinor = r.totalClosingCreditMinor.toString();
    dto.balanced = r.balanced;
    return dto;
  }

  @Get('profit-and-loss')
  @ApiOperation({ summary: 'Income statement for a date range (T-354)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'LedgerReport'))
  async plReport(@Query() q: RangeQueryDto): Promise<ProfitAndLossResponseDto> {
    const r = await this.profitAndLoss.execute(q);
    const dto = new ProfitAndLossResponseDto();
    dto.from = r.from;
    dto.to = r.to;
    dto.revenue = sectionView(r.revenue);
    dto.expenses = sectionView(r.expenses);
    dto.netProfitMinor = r.netProfitMinor.toString();
    return dto;
  }

  @Get('balance-sheet')
  @ApiOperation({ summary: 'Balance sheet as at a date (T-355)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'LedgerReport'))
  async bsReport(@Query() q: AsOfQueryDto): Promise<BalanceSheetResponseDto> {
    const r = await this.balanceSheet.execute(q);
    const dto = new BalanceSheetResponseDto();
    dto.asOf = r.asOf;
    dto.assets = sectionView(r.assets);
    dto.liabilities = sectionView(r.liabilities);
    dto.equity = sectionView(r.equity);
    dto.currentEarningsMinor = r.currentEarningsMinor.toString();
    dto.totalAssetsMinor = r.totalAssetsMinor.toString();
    dto.totalLiabilitiesAndEquityMinor =
      r.totalLiabilitiesAndEquityMinor.toString();
    dto.balanced = r.balanced;
    return dto;
  }

  @Post('periods/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Month-end close: lock the period once everything is posted (T-352)',
  })
  @CheckPolicies((ability) => ability.can(Action.Manage, 'FiscalYear'))
  async closePeriodAction(
    @Body() body: ClosePeriodRequestDto,
  ): Promise<PeriodCloseResponseDto> {
    const p = await this.closePeriod.execute(body);
    const dto = new PeriodCloseResponseDto();
    dto.fiscalYearId = p.fiscalYearId;
    dto.periodNo = p.periodNo;
    dto.startDate = p.startDate;
    dto.endDate = p.endDate;
    dto.status = p.status;
    return dto;
  }

  @Post('fiscal-years/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Year-end close: closing entry to retained earnings, lock, close (T-352)',
  })
  @CheckPolicies((ability) => ability.can(Action.Manage, 'FiscalYear'))
  async closeYearAction(
    @Param('id') id: string,
  ): Promise<YearCloseResponseDto> {
    const r = await this.closeYear.execute(id);
    const dto = new YearCloseResponseDto();
    dto.fiscalYearId = r.fiscalYearId;
    dto.closingEntry = r.closingEntry
      ? JournalEntryResponseDto.from(r.closingEntry)
      : null;
    return dto;
  }
}
