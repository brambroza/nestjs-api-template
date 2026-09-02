import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import { Bom, BomNotFoundError } from '../domain';

import { BOM_REPOSITORY, type BomRepository } from './ports/bom.repository';

/**
 * Swaps the active version for an item atomically: the previously
 * active BOM is deactivated and this one activated in one transaction,
 * so a production order released mid-swap sees exactly one of them.
 */
@Injectable()
export class ActivateBomUseCase {
  constructor(
    @Inject(BOM_REPOSITORY) private readonly repo: BomRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(bomId: string): Promise<Bom> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const bom = await this.repo.findById(tenantId, bomId);
      if (!bom) throw new BomNotFoundError(bomId);
      if (bom.snapshot().isActive) return bom;
      const now = this.clock.now();
      const current = await this.repo.findActiveForItem(
        tenantId,
        bom.snapshot().itemId,
      );
      if (current && current.snapshot().id !== bomId) {
        await this.repo.save(current.deactivate(now));
      }
      const activated = bom.activate(now);
      await this.repo.save(activated);
      return activated;
    });
  }
}
