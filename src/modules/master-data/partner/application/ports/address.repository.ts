import type { AddressType, PartnerAddress, PartnerRef } from '../../domain';

export const ADDRESS_REPOSITORY = Symbol('ADDRESS_REPOSITORY');

export interface AddressRepository {
  findById(tenantId: string, id: string): Promise<PartnerAddress | null>;
  findDefault(
    tenantId: string,
    partner: PartnerRef,
    addressType: AddressType,
  ): Promise<PartnerAddress | null>;
  listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly PartnerAddress[]>;
  create(address: PartnerAddress): Promise<void>;
}
