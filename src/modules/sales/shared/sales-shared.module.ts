import { Module } from '@nestjs/common';

import { MasterDataModule } from '../../master-data';

import { DOCUMENT_PRICING } from './application/ports/pricing.port';
import { SALES_REF_LOOKUP } from './application/ports/sales-ref-lookup.port';
import { MasterDataPricingAdapter } from './infrastructure/master-data-pricing.adapter';
import { PrismaSalesRefLookup } from './infrastructure/prisma-sales-ref-lookup';

/**
 * Shared kernel of the sales container: master-data lookups and the
 * pricing anti-corruption layer that quotation and sales-order both
 * need. Sub-modules import its root index only.
 */
@Module({
  imports: [MasterDataModule],
  providers: [
    { provide: SALES_REF_LOOKUP, useClass: PrismaSalesRefLookup },
    { provide: DOCUMENT_PRICING, useClass: MasterDataPricingAdapter },
  ],
  exports: [SALES_REF_LOOKUP, DOCUMENT_PRICING],
})
export class SalesSharedModule {}
