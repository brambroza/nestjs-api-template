import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Contact, PrimaryContactExistsError, type PartnerRef } from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  CONTACT_REPOSITORY,
  type ContactRepository,
} from './ports/contact.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface AddContactInput {
  readonly partner: PartnerRef;
  readonly fullName: string;
  readonly position?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly isPrimary?: boolean;
}

@Injectable()
export class AddContactUseCase {
  constructor(
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AddContactInput): Promise<Contact> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);

    if (input.isPrimary) {
      const existing = await this.contacts.findPrimary(tenantId, input.partner);
      if (existing) {
        throw new PrimaryContactExistsError(
          input.partner,
          existing.snapshot().id,
        );
      }
    }

    const contact = Contact.create({
      id: randomUUID(),
      tenantId,
      partner: input.partner,
      fullName: input.fullName,
      position: input.position ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      isPrimary: input.isPrimary ?? false,
      now: this.clock.now(),
    });
    await this.contacts.create(contact);
    return contact;
  }
}
