export const PURCHASE_TAX = Symbol('PURCHASE_TAX');

export interface VatLookupResult {
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly rateBasisPoints: number;
}

/** Anti-corruption port over master-data's ResolveTax (input VAT on purchase lines). */
export interface PurchaseTax {
  resolveVat(itemId: string): Promise<VatLookupResult>;
}
