import {
  CurrencyMismatchError,
  PriceSource,
  SalesRefInvalidError,
  type QuotationLineInput,
} from '../domain';

import type { QuotationPricing } from './ports/pricing.port';
import type { SalesRefLookup } from './ports/sales-ref-lookup.port';

/** A line as the API hands it in: item + quantity, optional manual price. */
export interface LineRequest {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly uomCode?: string | null;
  readonly description?: string | null;
  /** Manual price overrides the price list; audit trail via priceSource. */
  readonly unitPriceMinor?: bigint | null;
  readonly discountBp?: number;
}

export interface PricingContext {
  readonly tenantId: string;
  readonly customerId: string;
  readonly currency: string;
  readonly date: Date;
}

/**
 * Turns API line requests into fully priced/taxed domain inputs:
 *   item must exist and be active; uom defaults to the item's;
 *   price = manual override, else price list (must match currency);
 *   VAT = item override else tenant default.
 */
export async function priceLines(
  requests: readonly LineRequest[],
  ctx: PricingContext,
  deps: {
    readonly refs: SalesRefLookup;
    readonly pricing: QuotationPricing;
    readonly newId: () => string;
  },
): Promise<QuotationLineInput[]> {
  const out: QuotationLineInput[] = [];
  for (const req of requests) {
    const item = await deps.refs.findItem(ctx.tenantId, req.itemId);
    if (!item?.isActive) {
      throw new SalesRefInvalidError(
        `item ${req.itemId} does not exist or is inactive`,
      );
    }
    const uomCode =
      (req.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode;
    let unitPriceMinor: bigint;
    let priceSource: (typeof PriceSource)[keyof typeof PriceSource];
    let priceListId: string | null = null;
    if (req.unitPriceMinor !== null && req.unitPriceMinor !== undefined) {
      unitPriceMinor = req.unitPriceMinor;
      priceSource = PriceSource.Manual;
    } else {
      const price = await deps.pricing.resolvePrice({
        itemId: item.id,
        customerId: ctx.customerId,
        quantity: req.quantity,
        uomCode,
        date: ctx.date,
      });
      if (price.currency !== ctx.currency) {
        throw new CurrencyMismatchError(ctx.currency, price.currency, item.id);
      }
      unitPriceMinor = price.unitPriceMinor;
      priceSource = PriceSource.PriceList;
      priceListId = price.priceListId;
    }
    const vat = await deps.pricing.resolveVat(item.id);
    out.push({
      id: deps.newId(),
      itemId: item.id,
      itemSku: item.sku,
      description: (req.description ?? '').trim() || item.name,
      uomCode,
      quantity: req.quantity,
      unitPriceMinor,
      priceSource,
      priceListId,
      discountBp: req.discountBp ?? 0,
      taxCodeId: vat.taxCodeId,
      taxCode: vat.taxCode,
      taxRateBp: vat.rateBasisPoints,
    });
  }
  return out;
}
