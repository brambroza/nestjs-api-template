import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  deriveConsentState,
  type ConsentRecord,
  type ConsentState,
  type PartnerRef,
} from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  CONSENT_REPOSITORY,
  type ConsentRepository,
} from './ports/consent.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';

export interface ConsentView {
  readonly state: readonly ConsentState[];
  readonly history: readonly ConsentRecord[];
}

@Injectable()
export class GetConsentStateUseCase {
  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(partner: PartnerRef): Promise<ConsentView> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, partner);
    const history = await this.consents.listByPartner(tenantId, partner);
    return { state: deriveConsentState(history), history };
  }
}
