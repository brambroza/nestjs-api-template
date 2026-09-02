import { Module } from '@nestjs/common';

import { ItemController } from './api/item.controller';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ImportItemsUseCase,
  ListItemsUseCase,
} from './application';
import { CATEGORY_LOOKUP } from './application/ports/category-lookup.port';
import { ITEM_IMPORT_PARSER } from './application/ports/item-import-parser.port';
import { ITEM_REPOSITORY } from './application/ports/item.repository';
import { UOM_CATALOG_LOOKUP } from './application/ports/uom-catalog.port';
import { PrismaCategoryLookup } from './infrastructure/prisma-category-lookup';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository';
import { PrismaUomCatalogLookup } from './infrastructure/prisma-uom-catalog-lookup';
import { XlsxItemRowsParser } from './infrastructure/xlsx-item-rows.parser';

@Module({
  controllers: [ItemController],
  providers: [
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
    { provide: UOM_CATALOG_LOOKUP, useClass: PrismaUomCatalogLookup },
    { provide: CATEGORY_LOOKUP, useClass: PrismaCategoryLookup },
    { provide: ITEM_IMPORT_PARSER, useClass: XlsxItemRowsParser },
    CreateItemUseCase,
    GetItemUseCase,
    ListItemsUseCase,
    ImportItemsUseCase,
  ],
  exports: [CreateItemUseCase, GetItemUseCase, ListItemsUseCase],
})
export class ItemModule {}
