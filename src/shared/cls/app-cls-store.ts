import type { ClsStore } from 'nestjs-cls';

/**
 * The typed shape of what CLS carries per request/job.
 *
 * Strings — not domain brand types — on purpose. Shared doesn't know
 * about any specific module's identifier types. Module-side adapters
 * cast into the branded types when they read from CLS.
 *
 * `tenantId`/`userId` are nullable because CLS is populated BEFORE
 * authentication runs; guards fill them in. Any code that reads them
 * without a null-check will be caught by TypeScript.
 */
export interface AppClsStore extends ClsStore {
  requestId: string;
  tenantId: string | null;
  userId: string | null;
}
