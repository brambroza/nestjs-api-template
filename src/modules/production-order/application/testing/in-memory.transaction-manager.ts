import type { TransactionManager } from '../ports/transaction.port';

interface TxParticipant {
  beginTx(): void;
  commitTx(): void;
  rollbackTx(): void;
}

/**
 * A tx manager for tests. Runs each participant through
 * beginTx -> work -> commitTx (or rollbackTx on failure). Nested calls
 * participate in the outer tx per ADR 0002 §4.
 */
export class InMemoryTransactionManager implements TransactionManager {
  private nesting = 0;

  constructor(private readonly participants: readonly TxParticipant[]) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.nesting > 0) {
      this.nesting++;
      try {
        return await work();
      } finally {
        this.nesting--;
      }
    }
    this.nesting = 1;
    this.participants.forEach((p) => {
      p.beginTx();
    });
    try {
      const result = await work();
      this.participants.forEach((p) => {
        p.commitTx();
      });
      return result;
    } catch (err) {
      this.participants.forEach((p) => {
        p.rollbackTx();
      });
      throw err;
    } finally {
      this.nesting = 0;
    }
  }
}

/** Runs work directly, no participant staging — for concurrency scenarios. */
export class AutocommitTransactionManager implements TransactionManager {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
