export const USER_ROLES_LOOKUP = Symbol('USER_ROLES_LOOKUP');

/** Role NAMES held by a user — what policy steps are keyed on. */
export interface UserRolesLookup {
  rolesOf(tenantId: string, userId: string): Promise<readonly string[]>;
  userExists(tenantId: string, userId: string): Promise<boolean>;
}
