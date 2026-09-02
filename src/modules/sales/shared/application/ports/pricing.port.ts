export const DOCUMENT_PRICING = Symbol('DOCUMENT_PRICING');

export interface PriceLookupInput {
  readonly itemId: string;
  readonly customerId: string;
  readonly quantity: bigint;
  readonly uomCode: string;
  readonly date: Date;
}

export interface PriceLookupResult {
  readonly unitPriceMinor: bigint;
  readonly currency: string;
  readonly priceListId: string;
}

export interface VatLookupResult {
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly rateBasisPoints: number;
}

/**
 * Anti-corruption port over master-data's ResolvePrice / ResolveTax use
 * cases. Absence of a price surfaces as master-data's NoPriceFoundError
 * (404) — a document never silently prices at zero.
 */
export interface DocumentPricing {
  resolvePrice(input: PriceLookupInput): Promise<PriceLookupResult>;
  resolveVat(itemId: string): Promise<VatLookupResult>;
}
