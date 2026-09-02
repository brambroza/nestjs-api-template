import { Module } from '@nestjs/common';

import { ApprovalModule } from '../../approval';
import { MasterDataModule } from '../../master-data';

import { JournalController } from './api/journal.controller';
import { LedgerController } from './api/ledger.controller';
import {
  ACCOUNT_MAPPING_REPOSITORY,
  BalanceSheetUseCase,
  CloseFiscalYearUseCase,
  ClosePeriodUseCase,
  CreateJournalEntryUseCase,
  GL_OUTBOX,
  GetJournalEntryUseCase,
  JOURNAL_ENTRY_REPOSITORY,
  JournalWorkflow,
  LEDGER_BALANCE_QUERY,
  LEDGER_PERIODS,
  LEDGER_POSTING,
  LEDGER_POSTING_GATE,
  LEDGER_REF_LOOKUP,
  LedgerPostingService,
  ListAccountMappingsUseCase,
  ListJournalEntriesUseCase,
  PostJournalEntryUseCase,
  ProfitAndLossUseCase,
  ReverseJournalEntryUseCase,
  SubmitJournalEntryUseCase,
  TrialBalanceUseCase,
  UpsertAccountMappingUseCase,
  VoidJournalEntryUseCase,
} from './application';
import {
  MasterDataLedgerPeriods,
  MasterDataLedgerPostingGate,
} from './infrastructure/master-data.adapters';
import { PrismaGlOutbox } from './infrastructure/prisma-gl-outbox';
import { PrismaLedgerRefLookup } from './infrastructure/prisma-ledger-ref-lookup';
import {
  PrismaAccountMappingRepository,
  PrismaJournalEntryRepository,
  PrismaLedgerBalanceQuery,
} from './infrastructure/prisma-ledger.repositories';

/**
 * EPIC-C.4 General ledger. Other modules depend ONLY on LEDGER_POSTING,
 * imported from this module's root index.
 */
@Module({
  imports: [MasterDataModule, ApprovalModule],
  controllers: [JournalController, LedgerController],
  providers: [
    {
      provide: JOURNAL_ENTRY_REPOSITORY,
      useClass: PrismaJournalEntryRepository,
    },
    {
      provide: ACCOUNT_MAPPING_REPOSITORY,
      useClass: PrismaAccountMappingRepository,
    },
    { provide: LEDGER_BALANCE_QUERY, useClass: PrismaLedgerBalanceQuery },
    { provide: LEDGER_REF_LOOKUP, useClass: PrismaLedgerRefLookup },
    { provide: LEDGER_POSTING_GATE, useClass: MasterDataLedgerPostingGate },
    { provide: LEDGER_PERIODS, useClass: MasterDataLedgerPeriods },
    { provide: GL_OUTBOX, useClass: PrismaGlOutbox },
    LedgerPostingService,
    { provide: LEDGER_POSTING, useExisting: LedgerPostingService },
    JournalWorkflow,
    CreateJournalEntryUseCase,
    SubmitJournalEntryUseCase,
    PostJournalEntryUseCase,
    VoidJournalEntryUseCase,
    ReverseJournalEntryUseCase,
    GetJournalEntryUseCase,
    ListJournalEntriesUseCase,
    UpsertAccountMappingUseCase,
    ListAccountMappingsUseCase,
    ClosePeriodUseCase,
    CloseFiscalYearUseCase,
    TrialBalanceUseCase,
    ProfitAndLossUseCase,
    BalanceSheetUseCase,
  ],
  exports: [LEDGER_POSTING],
})
export class LedgerModule {}
