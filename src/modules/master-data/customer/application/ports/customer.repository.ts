import type { Customer } from '../../domain';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface ListCustomersOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
}

export interface CustomerRepository {
  findById(tenantId: string, id: string): Promise<Customer | null>;
  findByCode(tenantId: string, code: string): Promise<Customer | null>;
  list(
    tenantId: string,
    opts: ListCustomersOptions,
  ): Promise<{ items: readonly Customer[]; total: number }>;
  create(customer: Customer): Promise<void>;
}
