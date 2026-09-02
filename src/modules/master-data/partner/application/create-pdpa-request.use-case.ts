import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  PdpaRequest,
  PdpaRequestAlreadyOpenError,
  type PartnerRef,
  type PdpaRequestType,
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

export interface CreatePdpaRequestInput {
  readonly partner: PartnerRef;
  readonly requestType: PdpaRequestType;
  readonly reason?: string | null;
}

@Injectable()
export class CreatePdpaRequestUseCase {
  constructor(
    @Inject(PDPA_REQUEST_REPOSITORY)
    private readonly requests: PdpaRequestRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreatePdpaRequestInput): Promise<PdpaRequest> {
    const tenantId = this.tenant.getTenantId();
    await requireActivePartner(this.partners, tenantId, input.partner);

    const open = await this.requests.findPending(
      tenantId,
      input.partner,
      input.requestType,
    );
    if (open) {
      throw new PdpaRequestAlreadyOpenError(
        input.partner,
        input.requestType,
        open.snapshot().id,
      );
    }

    const request = PdpaRequest.create({
      id: randomUUID(),
      tenantId,
      partner: input.partner,
      requestType: input.requestType,
      reason: input.reason ?? null,
      requestedBy: this.tenant.getUserId(),
      requestedAt: this.clock.now(),
    });
    await this.requests.create(request);
    return request;
  }
}
