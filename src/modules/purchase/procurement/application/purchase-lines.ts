import { PriceSource, type DocumentLineInput } from '../../../../shared/domain';
import { PurchaseRefInvalidError, type RequisitionLineInput } from '../domain';

import type { PurchaseRefLookup } from './ports/purchase-ref-lookup.port';
import type { PurchaseTax } from './ports/purchase-tax.port';

/** A PO line as the API hands it in: vendor prices are always entered (no vendor price lists yet). */
export interface PurchaseLineRequest {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly unitPriceMinor: bigint;
  readonly uomCode?: string | null;
  readonly description?: string | null;
  readonly discountBp?: number;
}

export interface RequisitionLineRequest {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly uomCode?: string | null;
  readonly description?: string | null;
  readonly estimatedUnitPriceMinor?: bigint | null;
  readonly suggestedVendorId?: string | null;
}

export async function buildPurchaseOrderLines(
  requests: readonly PurchaseLineRequest[],
  tenantId: string,
  deps: {
    readonly refs: PurchaseRefLookup;
    readonly tax: PurchaseTax;
    readonly newId: () => string;
  },
): Promise<DocumentLineInput[]> {
  const out: DocumentLineInput[] = [];
  for (const req of requests) {
    const item = await deps.refs.findItem(tenantId, req.itemId);
    if (!item?.isActive) {
      throw new PurchaseRefInvalidError(
        `item ${req.itemId} does not exist or is inactive`,
      );
    }
    const vat = await deps.tax.resolveVat(item.id);
    out.push({
      id: deps.newId(),
      itemId: item.id,
      itemSku: item.sku,
      description: (req.description ?? '').trim() || item.name,
      uomCode: (req.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode,
      quantity: req.quantity,
      unitPriceMinor: req.unitPriceMinor,
      priceSource: PriceSource.Manual,
      priceListId: null,
      discountBp: req.discountBp ?? 0,
      taxCodeId: vat.taxCodeId,
      taxCode: vat.taxCode,
      taxRateBp: vat.rateBasisPoints,
    });
  }
  return out;
}

export async function buildRequisitionLines(
  requests: readonly RequisitionLineRequest[],
  tenantId: string,
  deps: { readonly refs: PurchaseRefLookup; readonly newId: () => string },
): Promise<RequisitionLineInput[]> {
  const out: RequisitionLineInput[] = [];
  for (const req of requests) {
    const item = await deps.refs.findItem(tenantId, req.itemId);
    if (!item?.isActive) {
      throw new PurchaseRefInvalidError(
        `item ${req.itemId} does not exist or is inactive`,
      );
    }
    const vendorId = (req.suggestedVendorId ?? '').trim() || null;
    if (vendorId) {
      const vendor = await deps.refs.findVendor(tenantId, vendorId);
      if (!vendor?.isActive) {
        throw new PurchaseRefInvalidError(
          `vendor ${vendorId} does not exist or is inactive`,
        );
      }
    }
    out.push({
      id: deps.newId(),
      itemId: item.id,
      itemSku: item.sku,
      description: (req.description ?? '').trim() || item.name,
      uomCode: (req.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode,
      quantity: req.quantity,
      estimatedUnitPriceMinor: req.estimatedUnitPriceMinor ?? 0n,
      suggestedVendorId: vendorId,
    });
  }
  return out;
}
