import { Global, Module } from '@nestjs/common';

import { UOM_CATALOG_LOOKUP } from '../item/application/ports/uom-catalog.port';

import { UomController } from './api/uom.controller';
import {
  CreateUomUseCase,
  GetUomUseCase,
  ListUomsUseCase,
} from './application';
import { UOM_REPOSITORY } from './application/ports/uom.repository';
import { PrismaUomCatalogLookup } from './infrastructure/prisma-uom-catalog-lookup';
import { PrismaUomRepository } from './infrastructure/prisma-uom.repository';

/**
 * @Global because it also provides UOM_CATALOG_LOOKUP — the read port
 * the item module (and future PO/PR modules) uses to validate UoM
 * codes without pulling in the UoM aggregate. Keeps the compile-time
 * dependency graph one-way: uom -> item never happens.
 */
@Global()
@Module({
  controllers: [UomController],
  providers: [
    { provide: UOM_REPOSITORY, useClass: PrismaUomRepository },
    { provide: UOM_CATALOG_LOOKUP, useClass: PrismaUomCatalogLookup },
    CreateUomUseCase,
    GetUomUseCase,
    ListUomsUseCase,
  ],
  exports: [
    UOM_CATALOG_LOOKUP,
    CreateUomUseCase,
    GetUomUseCase,
    ListUomsUseCase,
  ],
})
export class UomModule {}
