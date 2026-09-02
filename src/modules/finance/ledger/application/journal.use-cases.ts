import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { toIsoDate, type IsoDate } from '../../../../shared/domain';
import {
  DOCUMENT_NUMBER_GENERATOR,
  type DocumentNumberGenerator,
} from '../../../../shared/sequence';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import { APPROVAL_GATEWAY, type ApprovalGateway } from '../../../approval';
import {
  ACCOUNT_KEYS,
  AccountNotPostableError,
  GlRefInvalidError,
  GlVersionConflictError,
  JournalApprovalPendingError,
  JournalEntry,
  JournalEntryNotFoundError,
  JournalSourceType,
  isAccountKey,
  type AccountInfo,
  type AccountKey,
  type AccountMappingSnapshot,
  type GlEvent,
  type JournalLineInput,
} from '../domain';

import {
  ACCOUNT_MAPPING_REPOSITORY,
  GL_OUTBOX,
  JOURNAL_ENTRY_REPOSITORY,
  LEDGER_POSTING_GATE,
  LEDGER_REF_LOOKUP,
  type AccountMappingRepository,
  type GlOutbox,
  type JournalEntryRepository,
  type JournalFilter,
  type LedgerPostingGate,
  type LedgerRefLookup,
} from './ports';
import { JOURNAL_NUMBER_PREFIX, LedgerPostingService } from './posting.service';

export const JOURNAL_DOCUMENT_TYPE = 'JOURNAL_ENTRY';

function assertVersion(
  e: JournalEntry,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== e.version)
    throw new GlVersionConflictError(e.id, expected, e.version);
}

export function glEvent(
  e: JournalEntry,
  type: GlEvent['type'],
  actor: string,
  now: Date,
): GlEvent {
  const s = e.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    companyId: s.companyId,
    number: s.number,
    entryDate: s.entryDate,
    sourceType: s.sourceType,
    amountMinor: s.totalDebitMinor,
    currency: s.currency,
    actor,
  };
}

async function requireAccount(
  refs: LedgerRefLookup,
  tenantId: string,
  ref: {
    readonly accountId?: string | null;
    readonly accountCode?: string | null;
  },
): Promise<AccountInfo> {
  const a = ref.accountId
    ? await refs.findAccount(tenantId, ref.accountId)
    : ref.accountCode
      ? await refs.findAccountByCode(tenantId, ref.accountCode)
      : null;
  if (!a)
    throw new GlRefInvalidError(
      `account ${ref.accountId ?? ref.accountCode ?? '?'} does not exist`,
    );
  if (!a.isPostable || !a.isActive) throw new AccountNotPostableError(a.code);
  return a;
}

export interface ManualLineInput {
  readonly accountId?: string | null;
  readonly accountCode?: string | null;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly description?: string | null;
  readonly partyType?: string | null;
  readonly partyId?: string | null;
}

export interface CreateJournalEntryInput {
  readonly companyId: string;
  readonly entryDate: IsoDate;
  readonly description: string;
  readonly currency?: string | null;
  readonly lines: readonly ManualLineInput[];
}

export interface JournalActionInput {
  readonly entryId: string;
  readonly expectedVersion?: number | null;
}

export interface ReverseJournalInput extends JournalActionInput {
  readonly entryDate?: IsoDate | null;
  readonly description?: string | null;
}

/** T-350: manual journal voucher in DRAFT. */
@Injectable()
export class CreateJournalEntryUseCase {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(LEDGER_REF_LOOKUP) private readonly refs: LedgerRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateJournalEntryInput): Promise<JournalEntry> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const company = await this.refs.findCompany(tenantId, input.companyId);
      if (!company?.isActive)
        throw new GlRefInvalidError(
          `company ${input.companyId} does not exist or is inactive`,
        );
      const lines: JournalLineInput[] = [];
      for (const l of input.lines) {
        const a = await requireAccount(this.refs, tenantId, l);
        lines.push({
          accountId: a.id,
          accountCode: a.code,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
          description: l.description ?? null,
          partyType: l.partyType ?? null,
          partyId: l.partyId ?? null,
        });
      }
      const entry = JournalEntry.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(tenantId, JOURNAL_NUMBER_PREFIX, now),
        entryDate: input.entryDate,
        description: input.description,
        sourceType: JournalSourceType.Manual,
        currency: input.currency ?? company.baseCurrency,
        createdBy: this.tenant.getUserId(),
        lines,
        lineIds: lines.map(() => randomUUID()),
        now,
      });
      await this.entries.create(entry);
      return entry;
    });
  }
}

/**
 * Shared DRAFT → POSTED path for manual entries: approval matrix
 * (JOURNAL_ENTRY policy on the debit total, pull model), period gate,
 * outbox event.
 */
@Injectable()
export class JournalWorkflow {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(LEDGER_POSTING_GATE) private readonly gate: LedgerPostingGate,
    @Inject(GL_OUTBOX) private readonly outbox: GlOutbox,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async load(input: JournalActionInput): Promise<JournalEntry> {
    const e = await this.entries.findById(
      this.tenant.getTenantId(),
      input.entryId,
    );
    if (!e) throw new JournalEntryNotFoundError(input.entryId);
    assertVersion(e, input.expectedVersion);
    return e;
  }

  async post(e: JournalEntry, now: Date): Promise<JournalEntry> {
    const s = e.snapshot();
    await this.gate.assertOpen(s.companyId, s.entryDate);
    const actor = this.tenant.getUserId();
    const posted = await this.entries.save(e.post(actor, now));
    await this.outbox.enqueue({
      idempotencyKey: `${posted.id}:posted`,
      event: glEvent(posted, 'journal_entry.posted.v1', actor, now),
    });
    return posted;
  }

  /** DRAFT: open the approval; APPROVED at once (no policy) posts directly. */
  async submit(e: JournalEntry, now: Date): Promise<JournalEntry> {
    const s = e.snapshot();
    const outcome = await this.approvals.submit({
      documentType: JOURNAL_DOCUMENT_TYPE,
      documentId: s.id,
      amountMinor: s.totalDebitMinor,
      currency: s.currency,
    });
    if (outcome.status === 'APPROVED') return this.post(e, now);
    return this.entries.save(e.submit(outcome.requestId, now));
  }

  /** PENDING_APPROVAL: pull the approval state and act on it. */
  async resume(e: JournalEntry, now: Date): Promise<JournalEntry> {
    const state = await this.approvals.stateOf(JOURNAL_DOCUMENT_TYPE, e.id);
    switch (state.status) {
      case 'APPROVED':
      case 'NONE':
        return this.post(e, now);
      case 'REJECTED':
      case 'CANCELLED':
        return this.entries.save(e.reopen(now));
      case 'PENDING':
        throw new JournalApprovalPendingError(e.id, state.requestId);
    }
  }
}

@Injectable()
export class SubmitJournalEntryUseCase {
  constructor(
    private readonly workflow: JournalWorkflow,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: JournalActionInput): Promise<JournalEntry> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const e = await this.workflow.load(input);
      return this.workflow.submit(e, now);
    });
  }
}

/** DRAFT behaves like submit; PENDING_APPROVAL pulls the decision. */
@Injectable()
export class PostJournalEntryUseCase {
  constructor(
    private readonly workflow: JournalWorkflow,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: JournalActionInput): Promise<JournalEntry> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const e = await this.workflow.load(input);
      return e.status === 'DRAFT'
        ? this.workflow.submit(e, now)
        : this.workflow.resume(e, now);
    });
  }
}

@Injectable()
export class VoidJournalEntryUseCase {
  constructor(
    private readonly workflow: JournalWorkflow,
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: JournalActionInput): Promise<JournalEntry> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const e = await this.workflow.load(input);
      return this.entries.save(e.void(now));
    });
  }
}

/** POSTED → REVERSED by a mirror entry (posted entries are never edited). */
@Injectable()
export class ReverseJournalEntryUseCase {
  constructor(
    private readonly workflow: JournalWorkflow,
    private readonly posting: LedgerPostingService,
    @Inject(GL_OUTBOX) private readonly outbox: GlOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: ReverseJournalInput): Promise<JournalEntry> {
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const e = await this.workflow.load(input);
      const reversal = await this.posting.reverseEntry(
        e,
        input.entryDate ?? toIsoDate(now),
        (input.description ?? '').trim() ||
          `Reversal of ${e.snapshot().number}`,
        null,
      );
      await this.outbox.enqueue({
        idempotencyKey: `${e.id}:reversed`,
        event: glEvent(
          reversal,
          'journal_entry.reversed.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
      return reversal;
    });
  }
}

@Injectable()
export class GetJournalEntryUseCase {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<JournalEntry> {
    const e = await this.entries.findById(this.tenant.getTenantId(), id);
    if (!e) throw new JournalEntryNotFoundError(id);
    return e;
  }
}

@Injectable()
export class ListJournalEntriesUseCase {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  execute(f: JournalFilter) {
    return this.entries.list(this.tenant.getTenantId(), f);
  }
}

// ---- Account mappings -------------------------------------------------------

export interface UpsertAccountMappingInput {
  readonly companyId: string;
  readonly key: string;
  readonly accountId?: string | null;
  readonly accountCode?: string | null;
}

@Injectable()
export class UpsertAccountMappingUseCase {
  constructor(
    @Inject(ACCOUNT_MAPPING_REPOSITORY)
    private readonly mappings: AccountMappingRepository,
    @Inject(LEDGER_REF_LOOKUP) private readonly refs: LedgerRefLookup,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: UpsertAccountMappingInput,
  ): Promise<AccountMappingSnapshot> {
    const tenantId = this.tenant.getTenantId();
    const key = input.key.trim().toUpperCase();
    if (!isAccountKey(key))
      throw new GlRefInvalidError(
        `unknown posting key ${input.key}; expected one of ${ACCOUNT_KEYS.join(', ')}`,
      );
    return this.tx.runInTransaction(async () => {
      const company = await this.refs.findCompany(tenantId, input.companyId);
      if (!company)
        throw new GlRefInvalidError(
          `company ${input.companyId} does not exist`,
        );
      const account = await requireAccount(this.refs, tenantId, input);
      const existing = (
        await this.mappings.listForCompany(tenantId, company.id)
      ).find((m) => m.key === key);
      const m: AccountMappingSnapshot = {
        id: existing?.id ?? randomUUID(),
        tenantId,
        companyId: company.id,
        key,
        accountId: account.id,
        accountCode: account.code,
        updatedBy: this.tenant.getUserId(),
        updatedAt: this.clock.now(),
      };
      await this.mappings.upsert(m);
      return m;
    });
  }
}

export interface AccountMappingsView {
  readonly companyId: string;
  readonly mappings: readonly AccountMappingSnapshot[];
  /** Posting keys without an account yet; automatic postings needing them fail. */
  readonly missingKeys: readonly AccountKey[];
}

@Injectable()
export class ListAccountMappingsUseCase {
  constructor(
    @Inject(ACCOUNT_MAPPING_REPOSITORY)
    private readonly mappings: AccountMappingRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(companyId: string): Promise<AccountMappingsView> {
    const mappings = await this.mappings.listForCompany(
      this.tenant.getTenantId(),
      companyId,
    );
    const have = new Set(mappings.map((m) => m.key));
    return {
      companyId,
      mappings,
      missingKeys: ACCOUNT_KEYS.filter((k) => !have.has(k)),
    };
  }
}
