import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Branch, BranchNotFoundError } from '../domain';

import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from './ports/branch.repository';

@Injectable()
export class GetBranchUseCase {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly repo: BranchRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Branch> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new BranchNotFoundError(id);
    }
    return found;
  }
}
