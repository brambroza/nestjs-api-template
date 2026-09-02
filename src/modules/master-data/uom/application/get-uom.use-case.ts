import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { UomDefinition, UomNotFoundError } from '../domain';

import { UOM_REPOSITORY, type UomRepository } from './ports/uom.repository';

@Injectable()
export class GetUomUseCase {
  constructor(
    @Inject(UOM_REPOSITORY) private readonly repo: UomRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<UomDefinition> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new UomNotFoundError(id);
    }
    return found;
  }
}
