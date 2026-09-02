import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { BomProductInvalidError, type Bom } from '../domain';

import {
  BOM_ITEM_LOOKUP,
  type BomItemLookup,
} from './ports/bom-item-lookup.port';
import { BOM_REPOSITORY, type BomRepository } from './ports/bom.repository';

@Injectable()
export class ListBomsForItemUseCase {
  constructor(
    @Inject(BOM_REPOSITORY) private readonly repo: BomRepository,
    @Inject(BOM_ITEM_LOOKUP) private readonly items: BomItemLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(itemId: string): Promise<readonly Bom[]> {
    const tenantId = this.tenant.getTenantId();
    const item = await this.items.findById(tenantId, itemId);
    if (!item) throw new BomProductInvalidError(itemId);
    return this.repo.listForItem(tenantId, item.id);
  }
}
