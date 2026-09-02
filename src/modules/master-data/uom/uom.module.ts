import { Module } from '@nestjs/common';

import { UomController } from './api/uom.controller';
import {
  CreateUomUseCase,
  GetUomUseCase,
  ListUomsUseCase,
} from './application';
import { UOM_REPOSITORY } from './application/ports/uom.repository';
import { PrismaUomRepository } from './infrastructure/prisma-uom.repository';

@Module({
  controllers: [UomController],
  providers: [
    { provide: UOM_REPOSITORY, useClass: PrismaUomRepository },
    CreateUomUseCase,
    GetUomUseCase,
    ListUomsUseCase,
  ],
  exports: [CreateUomUseCase, GetUomUseCase, ListUomsUseCase],
})
export class UomModule {}
