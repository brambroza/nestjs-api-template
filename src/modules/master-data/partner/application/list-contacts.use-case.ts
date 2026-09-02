import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Contact, PartnerRef } from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  CONTACT_REPOSITORY,
  type ContactRepository,
} from './ports/contact.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface ListContactsInput {
  readonly partner: PartnerRef;
  readonly activeOnly?: boolean;
}

@Injectable()
export class ListContactsUseCase {
  constructor(
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListContactsInput): Promise<readonly Contact[]> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);
    return this.contacts.listByPartner(tenantId, input.partner, {
      activeOnly: input.activeOnly ?? true,
    });
  }
}
