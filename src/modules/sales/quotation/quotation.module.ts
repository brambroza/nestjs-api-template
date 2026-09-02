import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { MasterDataModule } from '../../master-data';

import { QuotationController } from './api/quotation.controller';
import {
  AcceptQuotationUseCase,
  CancelQuotationUseCase,
  CreateQuotationUseCase,
  ExpireQuotationsUseCase,
  GetQuotationUseCase,
  ListQuotationsUseCase,
  RejectQuotationUseCase,
  ReviseQuotationUseCase,
  SendQuotationUseCase,
  UpdateQuotationUseCase,
} from './application';
import { QUOTATION_OUTBOX } from './application/ports/outbox.port';
import { QUOTATION_PRICING } from './application/ports/pricing.port';
import { QUOTATION_REPOSITORY } from './application/ports/quotation.repository';
import { SALES_REF_LOOKUP } from './application/ports/sales-ref-lookup.port';
import { MasterDataPricingAdapter } from './infrastructure/master-data-pricing.adapter';
import { PrismaQuotationOutbox } from './infrastructure/prisma-quotation-outbox';
import { PrismaQuotationRepository } from './infrastructure/prisma-quotation.repository';
import { PrismaSalesRefLookup } from './infrastructure/prisma-sales-ref-lookup';
import { QuotationExpiryCron } from './infrastructure/quotation-expiry.cron';

/** EPIC-B.1 Quotation. Prices via master-data's public surface only. */
@Module({
  imports: [ScheduleModule.forRoot(), MasterDataModule],
  controllers: [QuotationController],
  providers: [
    { provide: QUOTATION_REPOSITORY, useClass: PrismaQuotationRepository },
    { provide: SALES_REF_LOOKUP, useClass: PrismaSalesRefLookup },
    { provide: QUOTATION_PRICING, useClass: MasterDataPricingAdapter },
    { provide: QUOTATION_OUTBOX, useClass: PrismaQuotationOutbox },
    QuotationExpiryCron,
    CreateQuotationUseCase,
    UpdateQuotationUseCase,
    SendQuotationUseCase,
    AcceptQuotationUseCase,
    RejectQuotationUseCase,
    CancelQuotationUseCase,
    ReviseQuotationUseCase,
    GetQuotationUseCase,
    ListQuotationsUseCase,
    ExpireQuotationsUseCase,
  ],
})
export class QuotationModule {}
