import { Module } from '@nestjs/common';

import { ItemController } from './api/item.controller';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ListItemsUseCase,
} from './application';
import { ITEM_REPOSITORY } from './application/ports/item.repository';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository';

/**
 * UOM_CATALOG_LOOKUP is provided globally by UomModule — no import here.
 */
@Module({
  controllers: [ItemController],
  providers: [
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
    CreateItemUseCase,
    GetItemUseCase,
    ListItemsUseCase,
  ],
  exports: [CreateItemUseCase, GetItemUseCase, ListItemsUseCase],
})
export class ItemModule {}
