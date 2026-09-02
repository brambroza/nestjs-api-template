import { Module } from '@nestjs/common';

import { ItemCategoryController } from './api/item-category.controller';
import {
  CreateItemCategoryUseCase,
  GetItemCategoryUseCase,
  ListItemCategoryTreeUseCase,
} from './application';
import { ITEM_CATEGORY_REPOSITORY } from './application/ports/item-category.repository';
import { PrismaItemCategoryRepository } from './infrastructure/prisma-item-category.repository';

@Module({
  controllers: [ItemCategoryController],
  providers: [
    {
      provide: ITEM_CATEGORY_REPOSITORY,
      useClass: PrismaItemCategoryRepository,
    },
    CreateItemCategoryUseCase,
    GetItemCategoryUseCase,
    ListItemCategoryTreeUseCase,
  ],
  exports: [GetItemCategoryUseCase, ListItemCategoryTreeUseCase],
})
export class ItemCategoryModule {}
