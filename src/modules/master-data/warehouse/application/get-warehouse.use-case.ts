import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Warehouse, WarehouseNotFoundError } from '../domain';

import {
  WAREHOUSE_REPOSITORY,
  type WarehouseRepository,
} from './ports/warehouse.repository';

@Injectable()
export class GetWarehouseUseCase {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly repo: WarehouseRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Warehouse> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new WarehouseNotFoundError(id);
    }
    return found;
  }
}
