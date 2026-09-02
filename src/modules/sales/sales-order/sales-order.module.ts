import { Module } from '@nestjs/common';

import { ApprovalModule } from '../../approval';
import { QuotationModule } from '../quotation';
import { SalesSharedModule } from '../shared';

import { DeliveryNoteController } from './api/delivery-note.controller';
import { SalesOrderController } from './api/sales-order.controller';
import {
  CancelDeliveryNoteUseCase,
  CancelSalesOrderUseCase,
  ConfirmSalesOrderUseCase,
  CreateDeliveryNoteUseCase,
  CreateSalesOrderUseCase,
  GetDeliveryNoteUseCase,
  GetSalesOrderUseCase,
  ListDeliveryNotesForOrderUseCase,
  ListSalesOrdersUseCase,
  ReopenSalesOrderUseCase,
  ShipDeliveryNoteUseCase,
  SubmitSalesOrderUseCase,
  UpdateSalesOrderUseCase,
} from './application';
import { DELIVERY_NOTE_REPOSITORY } from './application/ports/delivery-note.repository';
import { SALES_ORDER_OUTBOX } from './application/ports/outbox.port';
import { SALES_ORDER_REPOSITORY } from './application/ports/sales-order.repository';
import { PrismaDeliveryNoteRepository } from './infrastructure/prisma-delivery-note.repository';
import { PrismaSalesOrderOutbox } from './infrastructure/prisma-sales-order-outbox';
import { PrismaSalesOrderRepository } from './infrastructure/prisma-sales-order.repository';

/**
 * EPIC-B.2 Sales Order + Delivery Note. Depends only on public
 * surfaces: sales/shared (pricing + lookups), quotation (conversion
 * gateway) and approval (APPROVAL_GATEWAY).
 */
@Module({
  imports: [SalesSharedModule, QuotationModule, ApprovalModule],
  controllers: [SalesOrderController, DeliveryNoteController],
  providers: [
    { provide: SALES_ORDER_REPOSITORY, useClass: PrismaSalesOrderRepository },
    {
      provide: DELIVERY_NOTE_REPOSITORY,
      useClass: PrismaDeliveryNoteRepository,
    },
    { provide: SALES_ORDER_OUTBOX, useClass: PrismaSalesOrderOutbox },
    CreateSalesOrderUseCase,
    UpdateSalesOrderUseCase,
    SubmitSalesOrderUseCase,
    ConfirmSalesOrderUseCase,
    ReopenSalesOrderUseCase,
    CancelSalesOrderUseCase,
    GetSalesOrderUseCase,
    ListSalesOrdersUseCase,
    CreateDeliveryNoteUseCase,
    ShipDeliveryNoteUseCase,
    CancelDeliveryNoteUseCase,
    GetDeliveryNoteUseCase,
    ListDeliveryNotesForOrderUseCase,
  ],
})
export class SalesOrderModule {}
