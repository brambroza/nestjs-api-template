import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { ApprovalModule } from '../../approval';
import { InventoryModule } from '../../inventory';
import { MasterDataModule } from '../../master-data';

import { GoodsReceiptController } from './api/goods-receipt.controller';
import { PurchaseOrderController } from './api/purchase-order.controller';
import { ReorderRuleController } from './api/reorder-rule.controller';
import { RequisitionController } from './api/requisition.controller';
import {
  CancelGoodsReceiptUseCase,
  CancelPurchaseOrderUseCase,
  CancelRequisitionUseCase,
  ConfirmPurchaseOrderUseCase,
  ConfirmRequisitionUseCase,
  CreateGoodsReceiptUseCase,
  CreatePurchaseOrderUseCase,
  CreateRequisitionUseCase,
  GetGoodsReceiptUseCase,
  GetPurchaseOrderUseCase,
  GetRequisitionUseCase,
  ListGoodsReceiptsForOrderUseCase,
  ListPurchaseOrdersUseCase,
  ListReorderRulesUseCase,
  ListRequisitionsUseCase,
  PostGoodsReceiptUseCase,
  ReorderSweepUseCase,
  ReopenPurchaseOrderUseCase,
  ReopenRequisitionUseCase,
  SubmitPurchaseOrderUseCase,
  SubmitRequisitionUseCase,
  UpdatePurchaseOrderUseCase,
  UpdateRequisitionUseCase,
  UpsertReorderRuleUseCase,
} from './application';
import { GOODS_RECEIPT_REPOSITORY } from './application/ports/goods-receipt.repository';
import { PURCHASE_OUTBOX } from './application/ports/outbox.port';
import { PURCHASE_ORDER_REPOSITORY } from './application/ports/purchase-order.repository';
import { PURCHASE_REF_LOOKUP } from './application/ports/purchase-ref-lookup.port';
import { PURCHASE_TAX } from './application/ports/purchase-tax.port';
import {
  REORDER_RULE_REPOSITORY,
  STOCK_AVAILABILITY_LOOKUP,
} from './application/ports/reorder.ports';
import { REQUISITION_REPOSITORY } from './application/ports/requisition.repository';
import { MasterDataTaxAdapter } from './infrastructure/master-data-tax.adapter';
import { PrismaGoodsReceiptRepository } from './infrastructure/prisma-goods-receipt.repository';
import { PrismaPurchaseOrderRepository } from './infrastructure/prisma-purchase-order.repository';
import { PrismaPurchaseOutbox } from './infrastructure/prisma-purchase-outbox';
import { PrismaPurchaseRefLookup } from './infrastructure/prisma-purchase-ref-lookup';
import {
  PrismaReorderRuleRepository,
  PrismaStockAvailabilityLookup,
} from './infrastructure/prisma-reorder.adapters';
import { PrismaRequisitionRepository } from './infrastructure/prisma-requisition.repository';
import { ReorderCron } from './infrastructure/reorder.cron';

/**
 * EPIC-B.3 Procurement: requisition → purchase order → goods receipt.
 * One bounded context, three aggregates. Depends only on public
 * surfaces (master-data index, approval index).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MasterDataModule,
    ApprovalModule,
    InventoryModule,
  ],
  controllers: [
    RequisitionController,
    PurchaseOrderController,
    GoodsReceiptController,
    ReorderRuleController,
  ],
  providers: [
    { provide: REQUISITION_REPOSITORY, useClass: PrismaRequisitionRepository },
    {
      provide: PURCHASE_ORDER_REPOSITORY,
      useClass: PrismaPurchaseOrderRepository,
    },
    {
      provide: GOODS_RECEIPT_REPOSITORY,
      useClass: PrismaGoodsReceiptRepository,
    },
    { provide: PURCHASE_REF_LOOKUP, useClass: PrismaPurchaseRefLookup },
    { provide: PURCHASE_TAX, useClass: MasterDataTaxAdapter },
    { provide: PURCHASE_OUTBOX, useClass: PrismaPurchaseOutbox },
    { provide: REORDER_RULE_REPOSITORY, useClass: PrismaReorderRuleRepository },
    {
      provide: STOCK_AVAILABILITY_LOOKUP,
      useClass: PrismaStockAvailabilityLookup,
    },
    ReorderCron,
    CreateRequisitionUseCase,
    UpdateRequisitionUseCase,
    SubmitRequisitionUseCase,
    ConfirmRequisitionUseCase,
    ReopenRequisitionUseCase,
    CancelRequisitionUseCase,
    GetRequisitionUseCase,
    ListRequisitionsUseCase,
    CreatePurchaseOrderUseCase,
    UpdatePurchaseOrderUseCase,
    SubmitPurchaseOrderUseCase,
    ConfirmPurchaseOrderUseCase,
    ReopenPurchaseOrderUseCase,
    CancelPurchaseOrderUseCase,
    GetPurchaseOrderUseCase,
    ListPurchaseOrdersUseCase,
    CreateGoodsReceiptUseCase,
    PostGoodsReceiptUseCase,
    CancelGoodsReceiptUseCase,
    GetGoodsReceiptUseCase,
    ListGoodsReceiptsForOrderUseCase,
    UpsertReorderRuleUseCase,
    ListReorderRulesUseCase,
    ReorderSweepUseCase,
  ],
})
export class ProcurementModule {}
