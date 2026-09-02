import { Module } from '@nestjs/common';

import { VendorController } from './api/vendor.controller';
import {
  CreateVendorUseCase,
  GetVendorUseCase,
  ListVendorsUseCase,
} from './application';
import { VENDOR_REPOSITORY } from './application/ports/vendor.repository';
import { PrismaVendorRepository } from './infrastructure/prisma-vendor.repository';

@Module({
  controllers: [VendorController],
  providers: [
    { provide: VENDOR_REPOSITORY, useClass: PrismaVendorRepository },
    CreateVendorUseCase,
    GetVendorUseCase,
    ListVendorsUseCase,
  ],
  exports: [CreateVendorUseCase, GetVendorUseCase, ListVendorsUseCase],
})
export class VendorModule {}
