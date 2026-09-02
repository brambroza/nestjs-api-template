import { Module } from '@nestjs/common';

import { QuotationModule } from './quotation/quotation.module';
import { SalesOrderModule } from './sales-order/sales-order.module';
import { SalesSharedModule } from './shared/sales-shared.module';

/**
 * Sales container (Phase B): shared kernel, quotation, sales-order +
 * delivery note. Sub-modules never import each other — cross reads go
 * through lookup ports with direct Prisma adapters, exactly as in
 * master-data. dependency-cruiser treats `sales/<sub>` as the boundary.
 */
@Module({
  imports: [SalesSharedModule, QuotationModule, SalesOrderModule],
  exports: [QuotationModule, SalesOrderModule],
})
export class SalesModule {}
