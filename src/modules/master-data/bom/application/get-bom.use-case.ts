import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Bom, BomNotFoundError } from '../domain';

import { BOM_REPOSITORY, type BomRepository } from './ports/bom.repository';

@Injectable()
export class GetBomUseCase {
  constructor(
    @Inject(BOM_REPOSITORY) private readonly repo: BomRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Bom> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new BomNotFoundError(id);
    return found;
  }
}
