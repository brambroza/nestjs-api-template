import { Injectable } from '@nestjs/common';

import {
  ResolvePriceUseCase,
  ResolveTaxUseCase,
  TaxKind,
} from '../../../master-data';
import type {
  PriceLookupInput,
  PriceLookupResult,
  QuotationPricing,
  VatLookupResult,
} from '../application/ports/pricing.port';

/**
 * Adapter over master-data's public surface. Sales never imports
 * price-list or finance internals; if those use cases change shape,
 * this file is the only place that notices.
 */
@Injectable()
export class MasterDataPricingAdapter implements QuotationPricing {
  constructor(
    private readonly resolvePriceUseCase: ResolvePriceUseCase,
    private readonly resolveTaxUseCase: ResolveTaxUseCase,
  ) {}

  async resolvePrice(input: PriceLookupInput): Promise<PriceLookupResult> {
    const p = await this.resolvePriceUseCase.execute({
      itemId: input.itemId,
      customerId: input.customerId,
      quantity: input.quantity,
      uomCode: input.uomCode,
      date: input.date,
    });
    return {
      unitPriceMinor: p.unitPriceSatang,
      currency: p.currency,
      priceListId: p.priceListId,
    };
  }

  async resolveVat(itemId: string): Promise<VatLookupResult> {
    const t = await this.resolveTaxUseCase.execute({
      kind: TaxKind.Vat,
      itemId,
    });
    const s = t.taxCode.snapshot();
    return {
      taxCodeId: s.id,
      taxCode: s.code,
      rateBasisPoints: Number(s.rateBasisPoints),
    };
  }
}
