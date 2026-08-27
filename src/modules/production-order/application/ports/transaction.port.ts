export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

/**
 * ADR 0002. Every use case that writes to more than one repository
 * wraps its work in `runInTransaction`. Repositories always read
 * the current tx handle out of CLS — no `tx` parameter appears in
 * any application signature.
 */
export interface TransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
