import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { PartnerRef, PdpaRequest } from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';
import {
  PDPA_REQUEST_REPOSITORY,
  type PdpaRequestRepository,
} from './ports/pdpa-request.repository';

@Injectable()
export class ListPdpaRequestsUseCase {
  constructor(
    @Inject(PDPA_REQUEST_REPOSITORY)
    private readonly requests: PdpaRequestRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(partner: PartnerRef): Promise<readonly PdpaRequest[]> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, partner);
    return this.requests.listByPartner(tenantId, partner);
  }
}
