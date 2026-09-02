import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { NoPriceFoundError, resolvePrice, type PriceMatch } from '../domain';

import {
  PRICE_LIST_REF_LOOKUP,
  type PriceListRefLookup,
} from './ports/price-list-ref-lookup.port';
import {
  PRICE_LIST_REPOSITORY,
  type PriceListRepository,
} from './ports/price-list.repository';

export interface ResolvePriceInput {
  readonly itemId: string;
  readonly customerId?: string | null;
  /** Defaults to "now". */
  readonly date?: Date | null;
  readonly quantity?: bigint;
  /** Defaults to the item's defaultUomCode. */
  readonly uomCode?: string | null;
}

export interface ResolvedPrice extends PriceMatch {
  readonly itemId: string;
  readonly customerId: string | null;
  readonly date: Date;
  readonly quantity: bigint;
  readonly uomCode: string;
}

/**
 * The single entry point sales/purchase documents will call to price a
 * line. Absence of a price is a 404 (NoPriceFoundError) — a document
 * must never silently fall back to zero.
 */
@Injectable()
export class ResolvePriceUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY) private readonly repo: PriceListRepository,
    @Inject(PRICE_LIST_REF_LOOKUP) private readonly refs: PriceListRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ResolvePriceInput): Promise<ResolvedPrice> {
    const tenantId = this.tenant.getTenantId();
    const customerId = (input.customerId ?? '').trim() || null;
    const date = input.date ?? this.clock.now();
    const quantity = input.quantity ?? 1n;

    const item = await this.refs.findItem(tenantId, input.itemId);
    const uomCode = (input.uomCode ?? '').trim() || item?.defaultUomCode || '';
    if (!item || uomCode.length === 0) {
      throw new NoPriceFoundError(input.itemId, customerId, uomCode, date);
    }

    const candidates = await this.repo.candidatesFor(
      tenantId,
      item.id,
      customerId,
    );
    const match = resolvePrice(candidates, {
      customerId,
      date,
      quantity,
      uomCode,
    });
    if (!match) {
      throw new NoPriceFoundError(item.id, customerId, uomCode, date);
    }
    return { ...match, itemId: item.id, customerId, date, quantity, uomCode };
  }
}
