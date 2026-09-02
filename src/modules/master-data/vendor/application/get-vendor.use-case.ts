import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Vendor, VendorNotFoundError } from '../domain';

import {
  VENDOR_REPOSITORY,
  type VendorRepository,
} from './ports/vendor.repository';

@Injectable()
export class GetVendorUseCase {
  constructor(
    @Inject(VENDOR_REPOSITORY) private readonly repo: VendorRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Vendor> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new VendorNotFoundError(id);
    }
    return found;
  }
}
