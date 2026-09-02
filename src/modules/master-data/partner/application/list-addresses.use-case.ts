import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { PartnerAddress, PartnerRef } from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  ADDRESS_REPOSITORY,
  type AddressRepository,
} from './ports/address.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface ListAddressesInput {
  readonly partner: PartnerRef;
  readonly activeOnly?: boolean;
}

@Injectable()
export class ListAddressesUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: AddressRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListAddressesInput): Promise<readonly PartnerAddress[]> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);
    return this.addresses.listByPartner(tenantId, input.partner, {
      activeOnly: input.activeOnly ?? true,
    });
  }
}
