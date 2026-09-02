import { Module } from '@nestjs/common';

import { MasterDataModule } from '../../master-data';
import { LedgerModule } from '../ledger';

import { InvoiceController } from './api/invoice.controller';
import {
  ArReportController,
  ReceiptController,
} from './api/receipt.controller';
import {
  AR_LEDGER,
  AR_OUTBOX,
  AR_POSTING_GATE,
  AR_REF_LOOKUP,
  AR_TAX,
  ArAgingUseCase,
  AutoMatchPreviewUseCase,
  CreateInvoiceFromSalesOrderUseCase,
  CreateManualInvoiceUseCase,
  CreateNoteUseCase,
  CreateReceiptUseCase,
  CustomerStatementUseCase,
  GetInvoiceUseCase,
  GetReceiptUseCase,
  IssueInvoiceUseCase,
  ListInvoicesUseCase,
  ListReceiptsUseCase,
  PostReceiptUseCase,
  PromptPayForInvoiceUseCase,
  RECEIPT_REPOSITORY,
  SALES_INVOICE_REPOSITORY,
  TAX_INVOICE_NUMBER_GENERATOR,
  UpdateInvoiceUseCase,
  VoidInvoiceUseCase,
  VoidReceiptUseCase,
} from './application';
import {
  MasterDataArTaxAdapter,
  MasterDataPostingGate,
} from './infrastructure/master-data.adapters';
import { LedgerArAdapter } from './infrastructure/ledger.adapter';
import { PrismaArOutbox } from './infrastructure/prisma-ar-outbox';
import { PrismaArRefLookup } from './infrastructure/prisma-ar-ref-lookup';
import {
  PrismaReceiptRepository,
  PrismaSalesInvoiceRepository,
} from './infrastructure/prisma-ar.repositories';
import { PrismaTaxInvoiceNumberGenerator } from './infrastructure/prisma-tax-invoice-number.generator';

/** EPIC-C.2 Accounts receivable: tax invoices, notes, receipts, aging, statements. */
@Module({
  imports: [MasterDataModule, LedgerModule],
  controllers: [InvoiceController, ReceiptController, ArReportController],
  providers: [
    {
      provide: SALES_INVOICE_REPOSITORY,
      useClass: PrismaSalesInvoiceRepository,
    },
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
    {
      provide: TAX_INVOICE_NUMBER_GENERATOR,
      useClass: PrismaTaxInvoiceNumberGenerator,
    },
    { provide: AR_REF_LOOKUP, useClass: PrismaArRefLookup },
    { provide: AR_TAX, useClass: MasterDataArTaxAdapter },
    { provide: AR_POSTING_GATE, useClass: MasterDataPostingGate },
    { provide: AR_OUTBOX, useClass: PrismaArOutbox },
    { provide: AR_LEDGER, useClass: LedgerArAdapter },
    CreateInvoiceFromSalesOrderUseCase,
    CreateManualInvoiceUseCase,
    UpdateInvoiceUseCase,
    IssueInvoiceUseCase,
    VoidInvoiceUseCase,
    CreateNoteUseCase,
    GetInvoiceUseCase,
    ListInvoicesUseCase,
    PromptPayForInvoiceUseCase,
    CreateReceiptUseCase,
    PostReceiptUseCase,
    VoidReceiptUseCase,
    GetReceiptUseCase,
    ListReceiptsUseCase,
    AutoMatchPreviewUseCase,
    ArAgingUseCase,
    CustomerStatementUseCase,
  ],
})
export class ReceivableModule {}
