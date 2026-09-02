import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { InventoryController } from './api/inventory.controller';
import { TransferController } from './api/transfer.controller';
import {
  AdjustStockUseCase,
  CancelTransferUseCase,
  CreateTransferUseCase,
  ExpiryAlertUseCase,
  FindSerialUseCase,
  GetItemStockUseCase,
  GetTransferUseCase,
  INVENTORY_GATEWAY,
  InventoryGatewayService,
  IssueStockUseCase,
  ListLotsUseCase,
  ListMovementsUseCase,
  ListTransfersUseCase,
  ListWarehouseStockUseCase,
  ReceiveStockUseCase,
  ReceiveTransferUseCase,
  ReleaseReservationUseCase,
  ReserveStockUseCase,
  ShipTransferUseCase,
  StockLedgerService,
} from './application';
import { INVENTORY_REF_LOOKUP } from './application/ports/inventory-ref-lookup.port';
import { INVENTORY_OUTBOX } from './application/ports/outbox.port';
import {
  COST_REPOSITORY,
  LOT_REPOSITORY,
  RESERVATION_REPOSITORY,
  SERIAL_REPOSITORY,
  STOCK_BALANCE_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  TRANSFER_REPOSITORY,
} from './application/ports/repositories';
import { ExpiryAlertCron } from './infrastructure/expiry-alert.cron';
import { PrismaInventoryOutbox } from './infrastructure/prisma-inventory-outbox';
import { PrismaInventoryRefLookup } from './infrastructure/prisma-inventory-ref-lookup';
import {
  PrismaCostRepository,
  PrismaLotRepository,
  PrismaReservationRepository,
  PrismaSerialRepository,
  PrismaStockBalanceRepository,
  PrismaStockMovementRepository,
  PrismaTransferRepository,
} from './infrastructure/prisma-inventory.repositories';

/**
 * EPIC-C.1. Other modules depend ONLY on INVENTORY_GATEWAY, imported
 * from this module's root index.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InventoryController, TransferController],
  providers: [
    {
      provide: STOCK_BALANCE_REPOSITORY,
      useClass: PrismaStockBalanceRepository,
    },
    {
      provide: STOCK_MOVEMENT_REPOSITORY,
      useClass: PrismaStockMovementRepository,
    },
    { provide: COST_REPOSITORY, useClass: PrismaCostRepository },
    { provide: LOT_REPOSITORY, useClass: PrismaLotRepository },
    { provide: SERIAL_REPOSITORY, useClass: PrismaSerialRepository },
    { provide: RESERVATION_REPOSITORY, useClass: PrismaReservationRepository },
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    { provide: INVENTORY_REF_LOOKUP, useClass: PrismaInventoryRefLookup },
    { provide: INVENTORY_OUTBOX, useClass: PrismaInventoryOutbox },
    { provide: INVENTORY_GATEWAY, useClass: InventoryGatewayService },
    StockLedgerService,
    ExpiryAlertCron,
    ReceiveStockUseCase,
    IssueStockUseCase,
    AdjustStockUseCase,
    ReserveStockUseCase,
    ReleaseReservationUseCase,
    GetItemStockUseCase,
    ListWarehouseStockUseCase,
    ListMovementsUseCase,
    ListLotsUseCase,
    FindSerialUseCase,
    CreateTransferUseCase,
    ShipTransferUseCase,
    ReceiveTransferUseCase,
    CancelTransferUseCase,
    GetTransferUseCase,
    ListTransfersUseCase,
    ExpiryAlertUseCase,
  ],
  exports: [INVENTORY_GATEWAY],
})
export class InventoryModule {}
