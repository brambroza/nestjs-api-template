import type { Company } from '../../domain';

export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');

export interface ListCompaniesOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
}

export interface CompanyRepository {
  findById(tenantId: string, id: string): Promise<Company | null>;
  findByCode(tenantId: string, code: string): Promise<Company | null>;
  list(
    tenantId: string,
    opts: ListCompaniesOptions,
  ): Promise<{ items: readonly Company[]; total: number }>;
  create(company: Company): Promise<void>;
}
