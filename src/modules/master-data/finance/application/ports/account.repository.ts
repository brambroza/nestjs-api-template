import type { Account } from '../../domain';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface AccountRepository {
  findById(tenantId: string, id: string): Promise<Account | null>;
  findByCode(tenantId: string, code: string): Promise<Account | null>;
  listAll(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Account[]>;
  create(account: Account): Promise<void>;
}
