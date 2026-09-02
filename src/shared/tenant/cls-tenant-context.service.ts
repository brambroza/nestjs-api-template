import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../cls';

import {
  TenantContext,
  TenantContextMissingError,
  UserContextMissingError,
} from './tenant-context';

/**
 * Reads tenant/user out of the CLS store the auth middleware seeded.
 * A missing value throws a domain error (415-mapped) rather than
 * returning null — a use case that reached this without a tenant means
 * the guard chain is broken, and failing loud beats silent tenant leaks.
 */
@Injectable()
export class ClsTenantContextService implements TenantContext {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  getTenantId(): string {
    const value = this.cls.get('tenantId');
    if (value === null || value === undefined) {
      throw new TenantContextMissingError(
        'No tenantId in CLS. Ensure the request carries X-Tenant-Id or the auth guard has populated the store.',
      );
    }
    return value;
  }

  getUserId(): string {
    const value = this.cls.get('userId');
    if (value === null || value === undefined) {
      throw new UserContextMissingError(
        'No userId in CLS. The auth guard must run before use cases resolve.',
      );
    }
    return value;
  }

  tryGetUserId(): string | null {
    return this.cls.get('userId') ?? null;
  }
}
