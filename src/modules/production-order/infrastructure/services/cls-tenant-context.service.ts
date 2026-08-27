import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../../../../shared/cls';
import { DomainError } from '../../../../shared/errors';
import { TenantId, UserId } from '../../domain';
import type { TenantContext } from '../../application/ports/tenant-context.port';

export class TenantContextMissingError extends DomainError {
  readonly code = 'AUTH.TENANT_CONTEXT_MISSING';
}

export class UserContextMissingError extends DomainError {
  readonly code = 'AUTH.USER_CONTEXT_MISSING';
}

/**
 * Reads tenant + user identifiers out of the CLS store the request
 * middleware seeded. The strings become branded types at the boundary
 * here so use cases never handle raw strings.
 */
@Injectable()
export class ClsTenantContextService implements TenantContext {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  getTenantId(): TenantId {
    const value = this.cls.get('tenantId');
    if (value === null || value === undefined) {
      throw new TenantContextMissingError(
        'No tenantId in CLS. Ensure the request carries X-Tenant-Id or the auth guard has populated the store.',
      );
    }
    return TenantId.of(value);
  }

  getUserId(): UserId {
    const value = this.cls.get('userId');
    if (value === null || value === undefined) {
      throw new UserContextMissingError(
        'No userId in CLS. The auth guard must run before use cases resolve.',
      );
    }
    return UserId.of(value);
  }

  tryGetUserId(): UserId | null {
    const value = this.cls.get('userId');
    return value === null || value === undefined ? null : UserId.of(value);
  }
}
