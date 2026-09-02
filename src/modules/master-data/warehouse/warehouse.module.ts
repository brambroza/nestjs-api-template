import { Module } from '@nestjs/common';

import { WarehouseController } from './api/warehouse.controller';
import {
  CreateWarehouseUseCase,
  GetWarehouseUseCase,
  ListWarehousesUseCase,
} from './application';
import { BRANCH_LOOKUP } from './application/ports/branch-lookup.port';
import { WAREHOUSE_REPOSITORY } from './application/ports/warehouse.repository';
import { PrismaBranchLookup } from './infrastructure/prisma-branch-lookup';
import { PrismaWarehouseRepository } from './infrastructure/prisma-warehouse.repository';

@Module({
  controllers: [WarehouseController],
  providers: [
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
    { provide: BRANCH_LOOKUP, useClass: PrismaBranchLookup },
    CreateWarehouseUseCase,
    GetWarehouseUseCase,
    ListWarehousesUseCase,
  ],
  exports: [CreateWarehouseUseCase, GetWarehouseUseCase, ListWarehousesUseCase],
})
export class WarehouseModule {}
