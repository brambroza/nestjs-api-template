import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import type { IsoDate } from '../../../../shared/domain';
import {
  DOCUMENT_NUMBER_GENERATOR,
  type DocumentNumberGenerator,
} from '../../../../shared/sequence';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  AccountNotPostableError,
  JournalEntry,
  compactKeyedLines,
  resolveKeyedLines,
  type JournalLineInput,
  type JournalSourceType,
  type MappedAccount,
} from '../domain';

import {
  LEDGER_POSTING,
  type LedgerPostRequest,
  type LedgerPostResult,
  type LedgerPostingGateway,
  type LedgerReverseRequest,
} from './ledger-posting.gateway';
import {
  ACCOUNT_MAPPING_REPOSITORY,
  JOURNAL_ENTRY_REPOSITORY,
  LEDGER_POSTING_GATE,
  LEDGER_REF_LOOKUP,
  type AccountMappingRepository,
  type JournalEntryRepository,
  type LedgerPostingGate,
  type LedgerRefLookup,
} from './ports';

export const JOURNAL_NUMBER_PREFIX = 'JV';

export interface PostEntryCommand {
  readonly companyId: string;
  readonly entryDate: IsoDate;
  readonly currency: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId: string | null;
  readonly sourceKey: string | null;
  readonly description: string;
  readonly reversalOfId?: string | null;
  readonly lines: readonly JournalLineInput[];
  /** Year-end closing writes into the period being closed. */
  readonly skipPeriodGate?: boolean;
}

/**
 * Single writer of posted journal entries (T-350/T-351): resolves posting
 * keys, checks the period gate and account postability, numbers and
 * persists the entry as POSTED. Used by the sub-ledger gateway, manual
 * JV posting and the year-end close.
 */
@Injectable()
export class LedgerPostingService implements LedgerPostingGateway {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(ACCOUNT_MAPPING_REPOSITORY)
    private readonly mappings: AccountMappingRepository,
    @Inject(LEDGER_REF_LOOKUP) private readonly refs: LedgerRefLookup,
    @Inject(LEDGER_POSTING_GATE) private readonly gate: LedgerPostingGate,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async post(req: LedgerPostRequest): Promise<LedgerPostResult | null> {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.entries.findBySourceKey(
      tenantId,
      req.sourceKey,
    );
    if (existing)
      return {
        entryId: existing.id,
        number: existing.snapshot().number,
        created: false,
      };
    const keyed = compactKeyedLines(req.lines);
    if (keyed.length === 0) return null;
    const lines = resolveKeyedLines(
      req.companyId,
      keyed,
      await this.mappingsOf(tenantId, req.companyId),
    );
    const e = await this.postEntry({
      companyId: req.companyId,
      entryDate: req.entryDate,
      currency: req.currency,
      sourceType: req.sourceType,
      sourceId: req.sourceId,
      sourceKey: req.sourceKey,
      description: req.description,
      lines,
    });
    return { entryId: e.id, number: e.snapshot().number, created: true };
  }

  async reverse(
    req: LedgerReverseRequest,
  ): Promise<readonly LedgerPostResult[]> {
    const tenantId = this.tenant.getTenantId();
    const originals = await this.entries.listPostedForSource(
      tenantId,
      req.sourceType,
      req.sourceId,
    );
    const out: LedgerPostResult[] = [];
    for (const original of originals) {
      const r = await this.reverseEntry(
        original,
        req.entryDate,
        req.description,
        `${req.sourceKey}:${original.id}`,
      );
      out.push({ entryId: r.id, number: r.snapshot().number, created: true });
    }
    return out;
  }

  /** Mirror entry for one posted entry; marks the original REVERSED. */
  async reverseEntry(
    original: JournalEntry,
    entryDate: IsoDate,
    description: string,
    sourceKey: string | null,
  ): Promise<JournalEntry> {
    const os = original.snapshot();
    const reversal = await this.postEntry({
      companyId: os.companyId,
      entryDate,
      currency: os.currency,
      sourceType: os.sourceType,
      sourceId: os.sourceId,
      sourceKey,
      description,
      reversalOfId: os.id,
      lines: original.reversalLines(),
    });
    await this.entries.save(
      original.markReversed(reversal.id, this.clock.now()),
    );
    return reversal;
  }

  async mappingsOf(
    tenantId: string,
    companyId: string,
  ): Promise<ReadonlyMap<string, MappedAccount>> {
    const rows = await this.mappings.listForCompany(tenantId, companyId);
    return new Map(
      rows.map((m) => [
        m.key,
        { accountId: m.accountId, accountCode: m.accountCode },
      ]),
    );
  }

  async assertPostable(
    tenantId: string,
    accountIds: Iterable<string>,
  ): Promise<void> {
    for (const id of new Set(accountIds)) {
      const a = await this.refs.findAccount(tenantId, id);
      if (!a?.isPostable || !a.isActive)
        throw new AccountNotPostableError(a?.code ?? id);
    }
  }

  async postEntry(cmd: PostEntryCommand): Promise<JournalEntry> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    if (!cmd.skipPeriodGate)
      await this.gate.assertOpen(cmd.companyId, cmd.entryDate);
    await this.assertPostable(
      tenantId,
      cmd.lines.map((l) => l.accountId),
    );
    const number = await this.numbers.next(
      tenantId,
      JOURNAL_NUMBER_PREFIX,
      now,
    );
    const by = this.tenant.tryGetUserId() ?? 'system';
    const entry = JournalEntry.create({
      id: randomUUID(),
      tenantId,
      companyId: cmd.companyId,
      number,
      entryDate: cmd.entryDate,
      description: cmd.description,
      sourceType: cmd.sourceType,
      sourceId: cmd.sourceId,
      sourceKey: cmd.sourceKey,
      currency: cmd.currency,
      reversalOfId: cmd.reversalOfId ?? null,
      createdBy: by,
      lines: cmd.lines,
      lineIds: cmd.lines.map(() => randomUUID()),
      now,
    }).post(by, now);
    await this.entries.create(entry);
    return entry;
  }
}

export { LEDGER_POSTING };
