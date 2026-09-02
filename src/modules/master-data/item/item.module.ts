import { Module } from '@nestjs/common';

import { ItemController } from './api/item.controller';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ListItemsUseCase,
} from './application';
import { ITEM_REPOSITORY } from './application/ports/item.repository';
import { UOM_CATALOG_LOOKUP } from './application/ports/uom-catalog.port';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository';
import { PrismaUomCatalogLookup } from './infrastructure/prisma-uom-catalog-lookup';

@Module({
  controllers: [ItemController],
  providers: [
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
    { provide: UOM_CATALOG_LOOKUP, useClass: PrismaUomCatalogLookup },
    CreateItemUseCase,
    GetItemUseCase,
    ListItemsUseCase,
  ],
  exports: [CreateItemUseCase, GetItemUseCase, ListItemsUseCase],
})
export class ItemModule {}
