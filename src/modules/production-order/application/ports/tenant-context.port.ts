import type { TenantId, UserId } from '../../domain';

export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');

/**
 * R10: tenant + user context is read from CLS, never from a
 * function parameter threaded through every call. The Phase 4
 * middleware seeds it from JWT + tenant header; the Phase 5 outbox
 * worker seeds it per-job.
 */
export interface TenantContext {
  getTenantId(): TenantId;
  getUserId(): UserId;
  tryGetUserId(): UserId | null;
}
