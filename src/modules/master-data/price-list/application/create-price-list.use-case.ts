import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DuplicatePriceListCodeError,
  PriceList,
  PriceListRefInvalidError,
  type Currency,
} from '../domain';

import {
  PRICE_LIST_REF_LOOKUP,
  type PriceListRefLookup,
} from './ports/price-list-ref-lookup.port';
import {
  PRICE_LIST_REPOSITORY,
  type PriceListRepository,
} from './ports/price-list.repository';

export interface CreatePriceListInput {
  readonly code: string;
  readonly name: string;
  readonly currency: Currency;
  readonly customerId?: string | null;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
}

@Injectable()
export class CreatePriceListUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY) private readonly repo: PriceListRepository,
    @Inject(PRICE_LIST_REF_LOOKUP) private readonly refs: PriceListRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreatePriceListInput): Promise<PriceList> {
    const tenantId = this.tenant.getTenantId();
    const customerId = (input.customerId ?? '').trim() || null;
    const [existing, customerOk] = await Promise.all([
      this.repo.findByCode(tenantId, input.code.trim()),
      customerId === null
        ? Promise.resolve(true)
        : this.refs.customerExists(tenantId, customerId),
    ]);
    if (existing) throw new DuplicatePriceListCodeError(input.code);
    if (!customerOk) {
      throw new PriceListRefInvalidError(
        `customerId "${String(customerId)}" is not a known customer in this tenant`,
      );
    }
    const list = PriceList.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      currency: input.currency,
      customerId,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      now: this.clock.now(),
    });
    await this.repo.create(list);
    return list;
  }
}
