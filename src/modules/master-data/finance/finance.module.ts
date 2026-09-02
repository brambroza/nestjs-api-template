import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AccountController } from './api/account.controller';
import {
  CurrencyController,
  FxRateController,
} from './api/currency.controller';
import { FiscalYearController } from './api/fiscal-year.controller';
import { TaxController } from './api/tax.controller';
import {
  CheckPostingDateUseCase,
  CloseFiscalYearUseCase,
  ConvertAmountUseCase,
  CreateAccountUseCase,
  CreateCurrencyUseCase,
  CreateFiscalYearUseCase,
  CreateTaxCodeUseCase,
  GetAccountUseCase,
  GetFiscalYearUseCase,
  GetFxRateUseCase,
  ListAccountTreeUseCase,
  ListCurrenciesUseCase,
  ListFiscalYearsUseCase,
  ListFxRatesUseCase,
  ListTaxCodesUseCase,
  LockPeriodUseCase,
  ResolveTaxUseCase,
  SetItemTaxOverrideUseCase,
  SyncFxRatesUseCase,
  UnlockPeriodUseCase,
  UpsertFxRateUseCase,
} from './application';
import { ACCOUNT_REPOSITORY } from './application/ports/account.repository';
import { CURRENCY_REPOSITORY } from './application/ports/currency.repository';
import { FINANCE_REF_LOOKUP } from './application/ports/finance-ref-lookup.port';
import { FISCAL_YEAR_REPOSITORY } from './application/ports/fiscal-year.repository';
import { FX_RATE_SOURCE } from './application/ports/fx-rate-source.port';
import { FX_RATE_REPOSITORY } from './application/ports/fx-rate.repository';
import { TAX_CODE_REPOSITORY } from './application/ports/tax-code.repository';
import { TENANT_DIRECTORY } from './application/ports/tenant-directory.port';
import { BotFxRateClient } from './infrastructure/bot-fx-rate.client';
import { FxSyncCron } from './infrastructure/fx-sync.cron';
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository';
import { PrismaCurrencyRepository } from './infrastructure/prisma-currency.repository';
import {
  PrismaFinanceRefLookup,
  PrismaTenantDirectory,
} from './infrastructure/prisma-finance-ref-lookup';
import { PrismaFiscalYearRepository } from './infrastructure/prisma-fiscal-year.repository';
import { PrismaFxRateRepository } from './infrastructure/prisma-fx-rate.repository';
import { PrismaTaxCodeRepository } from './infrastructure/prisma-tax-code.repository';

/**
 * Financial configuration (EPIC-A.4). Exposes the three query use cases
 * downstream modules will call: ResolveTax (documents), ConvertAmount
 * (multi-currency documents) and CheckPostingDate (Phase C journals).
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    CurrencyController,
    FxRateController,
    TaxController,
    AccountController,
    FiscalYearController,
  ],
  providers: [
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
    { provide: FX_RATE_REPOSITORY, useClass: PrismaFxRateRepository },
    { provide: FX_RATE_SOURCE, useClass: BotFxRateClient },
    { provide: TENANT_DIRECTORY, useClass: PrismaTenantDirectory },
    { provide: TAX_CODE_REPOSITORY, useClass: PrismaTaxCodeRepository },
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    { provide: FISCAL_YEAR_REPOSITORY, useClass: PrismaFiscalYearRepository },
    { provide: FINANCE_REF_LOOKUP, useClass: PrismaFinanceRefLookup },
    FxSyncCron,
    ListCurrenciesUseCase,
    CreateCurrencyUseCase,
    GetFxRateUseCase,
    ListFxRatesUseCase,
    UpsertFxRateUseCase,
    SyncFxRatesUseCase,
    ConvertAmountUseCase,
    ListTaxCodesUseCase,
    CreateTaxCodeUseCase,
    SetItemTaxOverrideUseCase,
    ResolveTaxUseCase,
    CreateAccountUseCase,
    GetAccountUseCase,
    ListAccountTreeUseCase,
    CreateFiscalYearUseCase,
    GetFiscalYearUseCase,
    ListFiscalYearsUseCase,
    LockPeriodUseCase,
    UnlockPeriodUseCase,
    CloseFiscalYearUseCase,
    CheckPostingDateUseCase,
  ],
  exports: [
    ResolveTaxUseCase,
    ConvertAmountUseCase,
    CheckPostingDateUseCase,
    GetFxRateUseCase,
  ],
})
export class FinanceModule {}
