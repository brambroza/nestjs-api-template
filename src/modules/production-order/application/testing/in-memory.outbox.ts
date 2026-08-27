import type { OutboxEnvelope, OutboxPort } from '../ports/outbox.port';

/**
 * In-memory outbox with the same staging semantics as the repo: writes
 * inside a tx are not visible in `committed` until commit. The R8
 * rollback assertion inspects `committed` and expects it empty.
 */
export class InMemoryOutbox implements OutboxPort {
  private readonly committed: OutboxEnvelope[] = [];
  private staging: OutboxEnvelope[] | null = null;

  beginTx(): void {
    if (this.staging) {
      throw new Error('InMemoryOutbox does not support nested tx');
    }
    this.staging = [];
  }

  commitTx(): void {
    if (this.staging) {
      this.committed.push(...this.staging);
      this.staging = null;
    }
  }

  rollbackTx(): void {
    this.staging = null;
  }

  async enqueue(envelope: OutboxEnvelope): Promise<void> {
    if (this.staging) {
      this.staging.push(envelope);
    } else {
      this.committed.push(envelope);
    }
  }

  committedEnvelopes(): readonly OutboxEnvelope[] {
    return this.committed;
  }

  committedEventTypes(): readonly string[] {
    return this.committed.map((e) => e.event.type);
  }

  clear(): void {
    this.committed.length = 0;
    this.staging = null;
  }
}
