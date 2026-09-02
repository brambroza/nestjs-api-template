import { Module } from '@nestjs/common';

import { QuotationModule } from './quotation/quotation.module';

/**
 * Sales container (Phase B): quotation now, sales-order + delivery in
 * the next batch. Sub-modules never import each other — cross reads go
 * through lookup ports with direct Prisma adapters, exactly as in
 * master-data. dependency-cruiser treats `sales/<sub>` as the boundary.
 */
@Module({
  imports: [QuotationModule],
  exports: [QuotationModule],
})
export class SalesModule {}
