import { Module } from '@nestjs/common';

import { BomController } from './api/bom.controller';
import {
  ActivateBomUseCase,
  CreateBomUseCase,
  GetBomUseCase,
  ListBomsForItemUseCase,
} from './application';
import { BOM_ITEM_LOOKUP } from './application/ports/bom-item-lookup.port';
import { BOM_REPOSITORY } from './application/ports/bom.repository';
import { PrismaBomItemLookup } from './infrastructure/prisma-bom-item-lookup';
import { PrismaBomRepository } from './infrastructure/prisma-bom.repository';

/**
 * Master BOM (T-125). production-order does not import this module: its
 * BOM_LOOKUP adapter reads md_bom / md_bom_component through Prisma
 * directly, keyed by the order's productSku.
 */
@Module({
  controllers: [BomController],
  providers: [
    { provide: BOM_REPOSITORY, useClass: PrismaBomRepository },
    { provide: BOM_ITEM_LOOKUP, useClass: PrismaBomItemLookup },
    CreateBomUseCase,
    ActivateBomUseCase,
    GetBomUseCase,
    ListBomsForItemUseCase,
  ],
  exports: [GetBomUseCase, ListBomsForItemUseCase],
})
export class BomModule {}
