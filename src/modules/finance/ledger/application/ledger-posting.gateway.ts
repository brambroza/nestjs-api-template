import type { IsoDate } from '../../../../shared/domain';
import type { JournalSourceType, KeyedLine } from '../domain';

export const LEDGER_POSTING = Symbol('LEDGER_POSTING');

export interface LedgerPostRequest {
  readonly companyId: string;
  readonly entryDate: IsoDate;
  readonly currency: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId: string;
  /** Idempotency key, unique per tenant (e.g. `<invoiceId>:issued`). */
  readonly sourceKey: string;
  readonly description: string;
  readonly lines: readonly KeyedLine[];
}

export interface LedgerReverseRequest {
  readonly sourceType: JournalSourceType;
  readonly sourceId: string;
  readonly entryDate: IsoDate;
  readonly sourceKey: string;
  readonly description: string;
}

export interface LedgerPostResult {
  readonly entryId: string;
  readonly number: string;
  /** false when the sourceKey had already been posted (idempotent replay). */
  readonly created: boolean;
}

/**
 * The ONLY ledger surface the sub-ledgers see (re-exported from the
 * module root). Both calls join the caller's transaction via CLS, so a
 * receipt that fails to post rolls its GL entry back with it.
 */
export interface LedgerPostingGateway {
  /** null when every line nets to zero (nothing to post). */
  post(req: LedgerPostRequest): Promise<LedgerPostResult | null>;
  /** Reverses every POSTED entry of the source; empty when there was none. */
  reverse(req: LedgerReverseRequest): Promise<readonly LedgerPostResult[]>;
}
