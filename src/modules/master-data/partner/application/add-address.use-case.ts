import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import type { ThaiAddressInput } from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DefaultAddressExistsError,
  PartnerAddress,
  type AddressType,
  type PartnerRef,
} from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  ADDRESS_REPOSITORY,
  type AddressRepository,
} from './ports/address.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface AddAddressInput {
  readonly partner: PartnerRef;
  readonly addressType: AddressType;
  readonly label?: string | null;
  readonly address: ThaiAddressInput;
  readonly countryCode?: string | null;
  readonly branchNumber?: string | null;
  readonly isDefault?: boolean;
}

@Injectable()
export class AddAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: AddressRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AddAddressInput): Promise<PartnerAddress> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);

    if (input.isDefault) {
      const existing = await this.addresses.findDefault(
        tenantId,
        input.partner,
        input.addressType,
      );
      if (existing) {
        throw new DefaultAddressExistsError(
          input.partner,
          input.addressType,
          existing.snapshot().id,
        );
      }
    }

    const address = PartnerAddress.create({
      id: randomUUID(),
      tenantId,
      partner: input.partner,
      addressType: input.addressType,
      label: input.label ?? null,
      address: input.address,
      countryCode: input.countryCode ?? null,
      branchNumber: input.branchNumber ?? null,
      isDefault: input.isDefault ?? false,
      now: this.clock.now(),
    });
    await this.addresses.create(address);
    return address;
  }
}
