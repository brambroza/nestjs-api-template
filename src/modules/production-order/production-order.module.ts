import { Module } from '@nestjs/common';

import { APPROVAL_THRESHOLD } from './application/ports/approval-threshold.port';
import { BOM_LOOKUP } from './application/ports/bom-lookup.port';
import { CALENDAR } from './application/ports/calendar.port';
import { CLOCK } from './application/ports/clock.port';
import { INVENTORY } from './application/ports/inventory.port';
import { OUTBOX } from './application/ports/outbox.port';
import { PRODUCTION_ORDER_REPOSITORY } from './application/ports/production-order.repository';
import { TENANT_CONTEXT } from './application/ports/tenant-context.port';
import { TOLERANCE_POLICY } from './application/ports/tolerance-policy.port';
import { TRANSACTION_MANAGER } from './application/ports/transaction.port';
import {
  ApproveOrderUseCase,
  CancelOrderUseCase,
  CreateDraftOrderUseCase,
  GetOrderUseCase,
  ReleaseOrderUseCase,
  ReportProgressUseCase,
  SubmitOrderUseCase,
} from './application/use-cases';
import { ProductionOrderController } from './api/production-order.controller';
import {
  PrismaBomLookup,
  PrismaInventory,
  PrismaOutbox,
  PrismaProductionOrderRepository,
  PrismaTenantThresholdProvider,
  PrismaTenantToleranceProvider,
  WeekdayOnlyCalendar,
} from './infrastructure/persistence';
import { ClsTenantContextService } from './infrastructure/services/cls-tenant-context.service';
import { SystemClockService } from './infrastructure/services/system-clock.service';
import { PrismaTransactionManager } from '../../shared/database';

/**
 * All ports bound to their real adapters. Swap providers here to plug in
 * an ERP inventory system, a Redis-backed threshold, etc. — the domain
 * and application layers do not change.
 */
@Module({
  controllers: [ProductionOrderController],
  providers: [
    { provide: CLOCK, useClass: SystemClockService },
    { provide: TENANT_CONTEXT, useClass: ClsTenantContextService },
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    {
      provide: PRODUCTION_ORDER_REPOSITORY,
      useClass: PrismaProductionOrderRepository,
    },
    { provide: OUTBOX, useClass: PrismaOutbox },
    { provide: BOM_LOOKUP, useClass: PrismaBomLookup },
    { provide: INVENTORY, useClass: PrismaInventory },
    { provide: CALENDAR, useClass: WeekdayOnlyCalendar },
    { provide: APPROVAL_THRESHOLD, useClass: PrismaTenantThresholdProvider },
    { provide: TOLERANCE_POLICY, useClass: PrismaTenantToleranceProvider },
    SubmitOrderUseCase,
    ApproveOrderUseCase,
    ReleaseOrderUseCase,
    ReportProgressUseCase,
    CancelOrderUseCase,
    CreateDraftOrderUseCase,
    GetOrderUseCase,
  ],
  exports: [
    SubmitOrderUseCase,
    ApproveOrderUseCase,
    ReleaseOrderUseCase,
    ReportProgressUseCase,
    CancelOrderUseCase,
    CreateDraftOrderUseCase,
    GetOrderUseCase,
    CLOCK,
    TENANT_CONTEXT,
  ],
})
export class ProductionOrderModule {}
