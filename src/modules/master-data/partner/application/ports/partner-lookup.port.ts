import type { PartnerRef } from '../../domain';

export const PARTNER_LOOKUP = Symbol('PARTNER_LOOKUP');

export interface PartnerLookupResult {
  readonly isActive: boolean;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
}

/**
 * Resolves a polymorphic PartnerRef against md_customer / md_vendor.
 * Null for "not in this tenant" — a foreign tenant's id looks the same
 * as a typo (R10). The header fields feed the PDPA export bundle.
 */
export interface PartnerLookup {
  find(tenantId: string, ref: PartnerRef): Promise<PartnerLookupResult | null>;
}
