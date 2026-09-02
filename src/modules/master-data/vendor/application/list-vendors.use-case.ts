import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Vendor } from '../domain';

import {
  VENDOR_REPOSITORY,
  type VendorRepository,
} from './ports/vendor.repository';

export interface ListVendorsInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
}

export interface ListVendorsResult {
  readonly items: readonly Vendor[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListVendorsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(VENDOR_REPOSITORY) private readonly repo: VendorRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListVendorsInput = {}): Promise<ListVendorsResult> {
    const limit = clampInt(
      input.limit ?? ListVendorsUseCase.DEFAULT_LIMIT,
      1,
      ListVendorsUseCase.MAX_LIMIT,
    );
    const offset = clampInt(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const activeOnly = input.activeOnly ?? true;
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      activeOnly,
    });
    return { items, total, limit, offset };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}
