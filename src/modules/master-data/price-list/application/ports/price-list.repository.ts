import type { PriceCandidate, PriceList, PriceListLine } from '../../domain';

export const PRICE_LIST_REPOSITORY = Symbol('PRICE_LIST_REPOSITORY');

export interface ListPriceListsOptions {
  readonly limit: number;
  readonly offset: number;
  readonly customerId?: string | null;
  readonly activeOnly: boolean;
}

export interface PriceListRepository {
  findById(tenantId: string, id: string): Promise<PriceList | null>;
  findByCode(tenantId: string, code: string): Promise<PriceList | null>;
  list(
    tenantId: string,
    opts: ListPriceListsOptions,
  ): Promise<{ items: readonly PriceList[]; total: number }>;
  create(list: PriceList): Promise<void>;

  linesOf(
    tenantId: string,
    priceListId: string,
  ): Promise<readonly PriceListLine[]>;
  findLine(
    tenantId: string,
    priceListId: string,
    itemId: string,
    uomCode: string,
    minQty: bigint,
  ): Promise<PriceListLine | null>;
  addLine(line: PriceListLine): Promise<void>;

  /**
   * Every (list, line) pair for the item that could apply to the
   * customer: general lists plus the customer's own. Validity window
   * and uom are filtered by the domain resolver.
   */
  candidatesFor(
    tenantId: string,
    itemId: string,
    customerId: string | null,
  ): Promise<readonly PriceCandidate[]>;
}
