import { Module } from '@nestjs/common';

import { ApprovalModule } from '../../approval';
import { InventoryModule } from '../../inventory';
import { MasterDataModule } from '../../master-data';

import { GoodsReceiptController } from './api/goods-receipt.controller';
import { PurchaseOrderController } from './api/purchase-order.controller';
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
  ListRequisitionsUseCase,
  PostGoodsReceiptUseCase,
  ReopenPurchaseOrderUseCase,
  ReopenRequisitionUseCase,
  SubmitPurchaseOrderUseCase,
  SubmitRequisitionUseCase,
  UpdatePurchaseOrderUseCase,
  UpdateRequisitionUseCase,
} from './application';
import { GOODS_RECEIPT_REPOSITORY } from './application/ports/goods-receipt.repository';
import { PURCHASE_OUTBOX } from './application/ports/outbox.port';
import { PURCHASE_ORDER_REPOSITORY } from './application/ports/purchase-order.repository';
import { PURCHASE_REF_LOOKUP } from './application/ports/purchase-ref-lookup.port';
import { PURCHASE_TAX } from './application/ports/purchase-tax.port';
import { REQUISITION_REPOSITORY } from './application/ports/requisition.repository';
import { MasterDataTaxAdapter } from './infrastructure/master-data-tax.adapter';
import { PrismaGoodsReceiptRepository } from './infrastructure/prisma-goods-receipt.repository';
import { PrismaPurchaseOrderRepository } from './infrastructure/prisma-purchase-order.repository';
import { PrismaPurchaseOutbox } from './infrastructure/prisma-purchase-outbox';
import { PrismaPurchaseRefLookup } from './infrastructure/prisma-purchase-ref-lookup';
import { PrismaRequisitionRepository } from './infrastructure/prisma-requisition.repository';

/**
 * EPIC-B.3 Procurement: requisition → purchase order → goods receipt.
 * One bounded context, three aggregates. Depends only on public
 * surfaces (master-data index, approval index).
 */
@Module({
  imports: [MasterDataModule, ApprovalModule, InventoryModule],
  controllers: [
    RequisitionController,
    PurchaseOrderController,
    GoodsReceiptController,
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
  ],
})
export class ProcurementModule {}
