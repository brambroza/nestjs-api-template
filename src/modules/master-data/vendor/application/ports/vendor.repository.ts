import type { Vendor } from '../../domain';

export const VENDOR_REPOSITORY = Symbol('VENDOR_REPOSITORY');

export interface ListVendorsOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
}

export interface VendorRepository {
  findById(tenantId: string, id: string): Promise<Vendor | null>;
  findByCode(tenantId: string, code: string): Promise<Vendor | null>;
  list(
    tenantId: string,
    opts: ListVendorsOptions,
  ): Promise<{ items: readonly Vendor[]; total: number }>;
  create(vendor: Vendor): Promise<void>;
}
