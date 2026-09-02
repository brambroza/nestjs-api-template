import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DuplicatePriceListLineError,
  PriceListLine,
  PriceListNotFoundError,
  PriceListRefInvalidError,
} from '../domain';

import {
  PRICE_LIST_REF_LOOKUP,
  type PriceListRefLookup,
} from './ports/price-list-ref-lookup.port';
import {
  PRICE_LIST_REPOSITORY,
  type PriceListRepository,
} from './ports/price-list.repository';

export interface AddPriceListLineInput {
  readonly priceListId: string;
  readonly itemId: string;
  /** Defaults to the item's defaultUomCode. */
  readonly uomCode?: string | null;
  readonly minQty?: bigint;
  readonly unitPriceSatang: bigint;
}

@Injectable()
export class AddPriceListLineUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY) private readonly repo: PriceListRepository,
    @Inject(PRICE_LIST_REF_LOOKUP) private readonly refs: PriceListRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AddPriceListLineInput): Promise<PriceListLine> {
    const tenantId = this.tenant.getTenantId();
    const [list, item] = await Promise.all([
      this.repo.findById(tenantId, input.priceListId),
      this.refs.findItem(tenantId, input.itemId),
    ]);
    if (!list) throw new PriceListNotFoundError(input.priceListId);
    if (!item || !item.isActive) {
      throw new PriceListRefInvalidError(
        `itemId "${input.itemId}" is not a known active item in this tenant`,
      );
    }
    const uomCode = (input.uomCode ?? '').trim() || item.defaultUomCode;
    if (
      uomCode !== item.defaultUomCode &&
      !(await this.refs.uomExists(tenantId, uomCode))
    ) {
      throw new PriceListRefInvalidError(
        `uomCode "${uomCode}" is not a known UoM in this tenant`,
      );
    }
    const minQty = input.minQty ?? 1n;
    const dup = await this.repo.findLine(
      tenantId,
      list.snapshot().id,
      item.id,
      uomCode,
      minQty,
    );
    if (dup) throw new DuplicatePriceListLineError(item.id, uomCode, minQty);

    const line = PriceListLine.create({
      id: randomUUID(),
      tenantId,
      priceListId: list.snapshot().id,
      itemId: item.id,
      uomCode,
      minQty,
      unitPriceSatang: input.unitPriceSatang,
      now: this.clock.now(),
    });
    await this.repo.addLine(line);
    return line;
  }
}
