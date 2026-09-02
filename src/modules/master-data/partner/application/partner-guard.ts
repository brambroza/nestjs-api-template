import { PartnerNotFoundError, type PartnerRef } from '../domain';

import type {
  PartnerLookup,
  PartnerLookupResult,
} from './ports/partner-lookup.port';

/**
 * Every partner sub-resource use case starts here. Inactive partners
 * are treated as absent for writes AND reads: a deactivated customer's
 * contacts must not keep surfacing through a side door.
 */
export async function requireActivePartner(
  lookup: PartnerLookup,
  tenantId: string,
  ref: PartnerRef,
): Promise<PartnerLookupResult> {
  const found = await lookup.find(tenantId, ref);
  if (!found || !found.isActive) {
    throw new PartnerNotFoundError(ref);
  }
  return found;
}
