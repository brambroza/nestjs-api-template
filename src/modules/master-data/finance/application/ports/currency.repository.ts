import type { Currency } from '../../domain';

export const CURRENCY_REPOSITORY = Symbol('CURRENCY_REPOSITORY');

export interface CurrencyRepository {
  findByCode(tenantId: string, code: string): Promise<Currency | null>;
  list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Currency[]>;
  create(currency: Currency): Promise<void>;
}
