import type { PermissionRule } from '../../domain';

export const USER_PERMISSIONS = Symbol('USER_PERMISSIONS');

/**
 * Resolves the effective permission rules for a user by loading the
 * roles assigned to them and merging their JSON rule sets.
 */
export interface UserPermissionsProvider {
  forUser(userId: string): Promise<readonly PermissionRule[]>;
}
