export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

/**
 * ADR 0002. A use case that writes to more than one repository wraps
 * the work in `runInTransaction`. Repositories read the active tx
 * handle out of CLS, so no `tx` parameter ever appears in an
 * application-layer signature.
 *
 * Nested calls participate in the outer transaction (no savepoints);
 * the outermost frame owns commit/rollback.
 *
 * This is the shared port. DatabaseModule binds it to
 * PrismaTransactionManager. production-order keeps its own identical
 * port for historical reasons; new modules should import this one.
 */
export interface TransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
