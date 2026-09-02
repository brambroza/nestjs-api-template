import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { DuplicateVendorCodeError, Vendor } from '../domain';

import {
  VENDOR_REPOSITORY,
  type VendorRepository,
} from './ports/vendor.repository';

export interface CreateVendorInput {
  readonly code: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly paymentTermsDays?: number;
}

@Injectable()
export class CreateVendorUseCase {
  constructor(
    @Inject(VENDOR_REPOSITORY) private readonly repo: VendorRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateVendorInput): Promise<Vendor> {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByCode(tenantId, input.code.trim());
    if (existing) {
      throw new DuplicateVendorCodeError(input.code);
    }
    const vendor = Vendor.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      taxId: input.taxId ?? null,
      paymentTermsDays: input.paymentTermsDays,
      now: this.clock.now(),
    });
    await this.repo.create(vendor);
    return vendor;
  }
}
