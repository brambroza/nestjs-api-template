import { Module } from '@nestjs/common';

import { MasterDataModule } from '../../master-data';
import { LedgerModule } from '../ledger';

import {
  ApReportController,
  PaymentBatchController,
  PaymentVoucherController,
  VendorInvoiceController,
  WhtCertificateController,
} from './api/payable.controller';
import {
  AP_LEDGER,
  AP_OUTBOX,
  AP_POSTING_GATE,
  AP_REF_LOOKUP,
  AP_TAX,
  ApAgingUseCase,
  CashForecastUseCase,
  CreatePaymentBatchUseCase,
  CreatePaymentVoucherUseCase,
  CreateVendorInvoiceUseCase,
  GetPaymentBatchUseCase,
  GetPaymentVoucherUseCase,
  GetVendorInvoiceUseCase,
  GetWhtCertificateUseCase,
  ListPaymentVouchersUseCase,
  ListVendorInvoicesUseCase,
  ListWhtCertificatesUseCase,
  PAYMENT_BATCH_REPOSITORY,
  PAYMENT_VOUCHER_REPOSITORY,
  PostPaymentBatchUseCase,
  PostPaymentVoucherUseCase,
  PostVendorInvoiceUseCase,
  VENDOR_INVOICE_REPOSITORY,
  VoidPaymentBatchUseCase,
  VoidPaymentVoucherUseCase,
  VoidVendorInvoiceUseCase,
  VoucherPoster,
  WHT_CERTIFICATE_REPOSITORY,
} from './application';
import {
  MasterDataApPostingGate,
  MasterDataApTaxAdapter,
} from './infrastructure/master-data.adapters';
import { LedgerApAdapter } from './infrastructure/ledger.adapter';
import { PrismaApOutbox } from './infrastructure/prisma-ap-outbox';
import { PrismaApRefLookup } from './infrastructure/prisma-ap-ref-lookup';
import {
  PrismaPaymentBatchRepository,
  PrismaPaymentVoucherRepository,
  PrismaVendorInvoiceRepository,
  PrismaWhtCertificateRepository,
} from './infrastructure/prisma-ap.repositories';

/** EPIC-C.3 Accounts payable: vendor invoices (3-way match), payment vouchers with WHT, batches, certificates, aging. */
@Module({
  imports: [MasterDataModule, LedgerModule],
  controllers: [
    VendorInvoiceController,
    PaymentVoucherController,
    PaymentBatchController,
    WhtCertificateController,
    ApReportController,
  ],
  providers: [
    {
      provide: VENDOR_INVOICE_REPOSITORY,
      useClass: PrismaVendorInvoiceRepository,
    },
    {
      provide: PAYMENT_VOUCHER_REPOSITORY,
      useClass: PrismaPaymentVoucherRepository,
    },
    {
      provide: PAYMENT_BATCH_REPOSITORY,
      useClass: PrismaPaymentBatchRepository,
    },
    {
      provide: WHT_CERTIFICATE_REPOSITORY,
      useClass: PrismaWhtCertificateRepository,
    },
    { provide: AP_REF_LOOKUP, useClass: PrismaApRefLookup },
    { provide: AP_TAX, useClass: MasterDataApTaxAdapter },
    { provide: AP_POSTING_GATE, useClass: MasterDataApPostingGate },
    { provide: AP_OUTBOX, useClass: PrismaApOutbox },
    { provide: AP_LEDGER, useClass: LedgerApAdapter },
    VoucherPoster,
    CreateVendorInvoiceUseCase,
    PostVendorInvoiceUseCase,
    VoidVendorInvoiceUseCase,
    GetVendorInvoiceUseCase,
    ListVendorInvoicesUseCase,
    CreatePaymentVoucherUseCase,
    PostPaymentVoucherUseCase,
    VoidPaymentVoucherUseCase,
    GetPaymentVoucherUseCase,
    ListPaymentVouchersUseCase,
    CreatePaymentBatchUseCase,
    PostPaymentBatchUseCase,
    VoidPaymentBatchUseCase,
    GetPaymentBatchUseCase,
    GetWhtCertificateUseCase,
    ListWhtCertificatesUseCase,
    ApAgingUseCase,
    CashForecastUseCase,
  ],
})
export class PayableModule {}
