import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  PdpaRequestNotFoundError,
  type PartnerRef,
  type PdpaRequest,
} from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
} from './ports/partner-lookup.port';
import {
  PDPA_REQUEST_REPOSITORY,
  type PdpaRequestRepository,
} from './ports/pdpa-request.repository';

export interface RejectPdpaRequestInput {
  readonly partner: PartnerRef;
  readonly requestId: string;
  /** Required: the data subject is entitled to know why (PDPA §30). */
  readonly note: string;
}

@Injectable()
export class RejectPdpaRequestUseCase {
  constructor(
    @Inject(PDPA_REQUEST_REPOSITORY)
    private readonly requests: PdpaRequestRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RejectPdpaRequestInput): Promise<PdpaRequest> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);

    const request = await this.requests.findById(tenantId, input.requestId);
    const s = request?.snapshot();
    if (
      !request ||
      !s ||
      s.partner.type !== input.partner.type ||
      s.partner.id !== input.partner.id
    ) {
      throw new PdpaRequestNotFoundError(input.requestId);
    }
    const rejected = request.reject(
      this.tenant.getUserId(),
      this.clock.now(),
      input.note,
    );
    await this.requests.save(rejected);
    return rejected;
  }
}
