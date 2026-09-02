import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  Bom,
  BomComponentInvalidError,
  BomCycleError,
  BomProductInvalidError,
  DuplicateBomVersionError,
} from '../domain';

import {
  BOM_ITEM_LOOKUP,
  type BomItemLookup,
} from './ports/bom-item-lookup.port';
import { BOM_REPOSITORY, type BomRepository } from './ports/bom.repository';

export interface CreateBomComponentInputDto {
  readonly componentItemId: string;
  readonly qtyPerUnit: bigint;
  /** Defaults to the component item's defaultUomCode. */
  readonly qtyPerUnitUom?: string | null;
  readonly scrapBasisPoints?: bigint;
  readonly yieldBasisPoints?: bigint;
  readonly minPack?: bigint;
  readonly minPackUom?: string | null;
}

export interface CreateBomInput {
  readonly itemId: string;
  /** Defaults to (highest existing version + 1). */
  readonly version?: number | null;
  readonly name?: string | null;
  readonly components: readonly CreateBomComponentInputDto[];
}

/** Multi-level BOMs deeper than this are treated as a cycle — nothing real nests 50 deep. */
const MAX_EXPLOSION_DEPTH = 50;

@Injectable()
export class CreateBomUseCase {
  constructor(
    @Inject(BOM_REPOSITORY) private readonly repo: BomRepository,
    @Inject(BOM_ITEM_LOOKUP) private readonly items: BomItemLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateBomInput): Promise<Bom> {
    const tenantId = this.tenant.getTenantId();

    const product = await this.items.findById(tenantId, input.itemId);
    if (!product || !product.isActive) {
      throw new BomProductInvalidError(input.itemId);
    }

    const existing = await this.repo.listForItem(tenantId, product.id);
    const version =
      input.version ??
      existing.reduce((max, b) => Math.max(max, b.snapshot().version), 0) + 1;
    if (existing.some((b) => b.snapshot().version === version)) {
      throw new DuplicateBomVersionError(product.id, version);
    }

    const componentIds = input.components.map((c) => c.componentItemId);
    const refs = await this.items.findByIds(tenantId, componentIds);
    const components = input.components.map((c) => {
      const ref = refs.get(c.componentItemId);
      if (!ref || !ref.isActive) {
        throw new BomComponentInvalidError(
          c.componentItemId,
          'does not exist or is inactive in this tenant',
        );
      }
      const uom = (c.qtyPerUnitUom ?? '').trim() || ref.defaultUomCode;
      return {
        id: randomUUID(),
        componentItemId: ref.id,
        componentSku: ref.sku,
        qtyPerUnit: c.qtyPerUnit,
        qtyPerUnitUom: uom,
        scrapBasisPoints: c.scrapBasisPoints,
        yieldBasisPoints: c.yieldBasisPoints,
        minPack: c.minPack,
        minPackUom: (c.minPackUom ?? '').trim() || uom,
      };
    });

    await this.assertNoCycle(tenantId, product.id, componentIds);

    const bom = Bom.create({
      id: randomUUID(),
      tenantId,
      itemId: product.id,
      productSku: product.sku,
      version,
      name: input.name ?? null,
      components,
      now: this.clock.now(),
    });
    await this.repo.create(bom);
    return bom;
  }

  /**
   * Walks each component's ACTIVE BOM downward. If the product being
   * defined ever appears, the new BOM would close a loop (A needs B,
   * B needs A) and any explosion would never terminate.
   */
  private async assertNoCycle(
    tenantId: string,
    productItemId: string,
    componentIds: readonly string[],
  ): Promise<void> {
    for (const start of componentIds) {
      const visited = new Set<string>();
      const queue: { id: string; depth: number }[] = [{ id: start, depth: 1 }];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        if (current.id === productItemId) {
          throw new BomCycleError(productItemId, start);
        }
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.depth > MAX_EXPLOSION_DEPTH) {
          throw new BomCycleError(productItemId, start);
        }
        const sub = await this.repo.findActiveForItem(tenantId, current.id);
        if (!sub) continue;
        for (const next of sub.componentItemIds) {
          queue.push({ id: next, depth: current.depth + 1 });
        }
      }
    }
  }
}
