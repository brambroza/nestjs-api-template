import type { TenantId, UserId } from '../../domain';
import type { TenantContext } from '../ports/tenant-context.port';

/** Test tenant context. Set the current tenant/user via `enter`. */
export class InMemoryTenantContext implements TenantContext {
  private tenantId: TenantId | null = null;
  private userId: UserId | null = null;

  enter(tenantId: TenantId, userId: UserId): void {
    this.tenantId = tenantId;
    this.userId = userId;
  }

  getTenantId(): TenantId {
    if (!this.tenantId) {
      throw new Error('TenantContext.getTenantId called before enter()');
    }
    return this.tenantId;
  }

  getUserId(): UserId {
    if (!this.userId) {
      throw new Error('TenantContext.getUserId called before enter()');
    }
    return this.userId;
  }

  tryGetUserId(): UserId | null {
    return this.userId;
  }
}
