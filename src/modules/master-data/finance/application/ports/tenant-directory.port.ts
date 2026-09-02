export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');

/**
 * The FX cron runs outside any request, so there is no CLS tenant. It
 * enumerates tenants through this port and processes each in turn.
 */
export interface TenantDirectory {
  listTenantIds(): Promise<readonly string[]>;
}
