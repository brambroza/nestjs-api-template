import { Module } from '@nestjs/common';

import {
  PriceListController,
  PriceResolveController,
} from './api/price-list.controller';
import {
  AddPriceListLineUseCase,
  CreatePriceListUseCase,
  GetPriceListUseCase,
  ListPriceListsUseCase,
  ResolvePriceUseCase,
} from './application';
import { PRICE_LIST_REF_LOOKUP } from './application/ports/price-list-ref-lookup.port';
import { PRICE_LIST_REPOSITORY } from './application/ports/price-list.repository';
import { PrismaPriceListRefLookup } from './infrastructure/prisma-price-list-ref-lookup';
import { PrismaPriceListRepository } from './infrastructure/prisma-price-list.repository';

@Module({
  controllers: [PriceListController, PriceResolveController],
  providers: [
    { provide: PRICE_LIST_REPOSITORY, useClass: PrismaPriceListRepository },
    { provide: PRICE_LIST_REF_LOOKUP, useClass: PrismaPriceListRefLookup },
    CreatePriceListUseCase,
    AddPriceListLineUseCase,
    GetPriceListUseCase,
    ListPriceListsUseCase,
    ResolvePriceUseCase,
  ],
  /** ResolvePriceUseCase is what Phase B sales/purchase documents will consume. */
  exports: [ResolvePriceUseCase, GetPriceListUseCase],
})
export class PriceListModule {}
