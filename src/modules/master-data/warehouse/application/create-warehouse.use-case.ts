import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DefaultWarehouseAlreadyExistsError,
  DuplicateWarehouseCodeError,
  Warehouse,
  WarehouseBranchInvalidError,
} from '../domain';

import { BRANCH_LOOKUP, type BranchLookup } from './ports/branch-lookup.port';
import {
  WAREHOUSE_REPOSITORY,
  type WarehouseRepository,
} from './ports/warehouse.repository';

export interface CreateWarehouseInput {
  readonly branchId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault?: boolean;
}

/**
 * The "one default per branch" rule is enforced twice: here for a
 * friendly 409, and by a filtered unique index in the migration for the
 * concurrent-insert race the use-case check cannot see.
 */
@Injectable()
export class CreateWarehouseUseCase {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly repo: WarehouseRepository,
    @Inject(BRANCH_LOOKUP) private readonly branches: BranchLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateWarehouseInput): Promise<Warehouse> {
    const tenantId = this.tenant.getTenantId();
    const wantDefault = input.isDefault ?? false;

    const [branch, byCode, existingDefault] = await Promise.all([
      this.branches.find(tenantId, input.branchId),
      this.repo.findByCode(tenantId, input.code.trim()),
      wantDefault
        ? this.repo.findDefaultForBranch(tenantId, input.branchId)
        : Promise.resolve(null),
    ]);
    if (!branch || !branch.isActive) {
      throw new WarehouseBranchInvalidError(input.branchId);
    }
    if (byCode) {
      throw new DuplicateWarehouseCodeError(input.code);
    }
    if (existingDefault) {
      throw new DefaultWarehouseAlreadyExistsError(
        input.branchId,
        existingDefault.snapshot().id,
      );
    }

    const warehouse = Warehouse.create({
      id: randomUUID(),
      tenantId,
      branchId: input.branchId,
      code: input.code,
      name: input.name,
      isDefault: wantDefault,
      now: this.clock.now(),
    });
    await this.repo.create(warehouse);
    return warehouse;
  }
}
