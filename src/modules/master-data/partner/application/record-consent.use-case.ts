import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  ConsentRecord,
  ContactNotFoundError,
  type ConsentAction,
  type ConsentPurpose,
  type ConsentSource,
  type PartnerRef,
} from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  CONSENT_REPOSITORY,
  type ConsentRepository,
} from './ports/consent.repository';
import {
  CONTACT_REPOSITORY,
  type ContactRepository,
} from './ports/contact.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface RecordConsentInput {
  readonly partner: PartnerRef;
  readonly contactId?: string | null;
  readonly purpose: ConsentPurpose;
  readonly action: ConsentAction;
  readonly source: ConsentSource;
  readonly evidenceRef?: string | null;
  readonly note?: string | null;
}

@Injectable()
export class RecordConsentUseCase {
  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RecordConsentInput): Promise<ConsentRecord> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);

    const contactId = input.contactId ?? null;
    if (contactId !== null) {
      const contact = await this.contacts.findById(tenantId, contactId);
      const s = contact?.snapshot();
      // A contact id that belongs to a different partner is "not found",
      // not "forbidden" — no cross-partner existence oracle.
      if (
        !s ||
        s.partner.type !== input.partner.type ||
        s.partner.id !== input.partner.id
      ) {
        throw new ContactNotFoundError(contactId);
      }
    }

    const record = ConsentRecord.create({
      id: randomUUID(),
      tenantId,
      partner: input.partner,
      contactId,
      purpose: input.purpose,
      action: input.action,
      source: input.source,
      evidenceRef: input.evidenceRef ?? null,
      note: input.note ?? null,
      recordedBy: this.tenant.getUserId(),
      recordedAt: this.clock.now(),
    });
    await this.consents.append(record);
    return record;
  }
}
