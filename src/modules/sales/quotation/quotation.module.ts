import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { SalesSharedModule } from '../shared';

import { QuotationController } from './api/quotation.controller';
import {
  AcceptQuotationUseCase,
  CancelQuotationUseCase,
  CreateQuotationUseCase,
  ExpireQuotationsUseCase,
  GetQuotationUseCase,
  ListQuotationsUseCase,
  QUOTATION_CONVERSION,
  QuotationConversionService,
  RejectQuotationUseCase,
  ReviseQuotationUseCase,
  SendQuotationUseCase,
  UpdateQuotationUseCase,
} from './application';
import { QUOTATION_OUTBOX } from './application/ports/outbox.port';
import { QUOTATION_REPOSITORY } from './application/ports/quotation.repository';
import { PrismaQuotationOutbox } from './infrastructure/prisma-quotation-outbox';
import { PrismaQuotationRepository } from './infrastructure/prisma-quotation.repository';
import { QuotationExpiryCron } from './infrastructure/quotation-expiry.cron';

/** EPIC-B.1 Quotation. Pricing and master-data lookups come from SalesSharedModule. */
@Module({
  imports: [ScheduleModule.forRoot(), SalesSharedModule],
  controllers: [QuotationController],
  providers: [
    { provide: QUOTATION_REPOSITORY, useClass: PrismaQuotationRepository },
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
    { provide: QUOTATION_CONVERSION, useClass: QuotationConversionService },
  ],
  exports: [QUOTATION_CONVERSION],
})
export class QuotationModule {}
