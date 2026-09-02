import { DomainError } from '../errors';

export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');

/**
 * Read-only view onto the ambient tenant/user for the current request.
 * Master-data modules use string identifiers (no branded types) because
 * they are the identity layer — everything below them consumes these
 * strings. Feature modules with domain-specific brands can keep their
 * own typed context (see production-order's ClsTenantContextService).
 */
export interface TenantContext {
  getTenantId(): string;
  getUserId(): string;
  tryGetUserId(): string | null;
}

export class TenantContextMissingError extends DomainError {
  readonly code = 'AUTH.TENANT_CONTEXT_MISSING';
}

export class UserContextMissingError extends DomainError {
  readonly code = 'AUTH.USER_CONTEXT_MISSING';
}
