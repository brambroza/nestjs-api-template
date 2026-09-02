import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { addDays, toIsoDate, type IsoDate } from '../../../../shared/domain';
import {
  DOCUMENT_NUMBER_GENERATOR,
  type DocumentNumberGenerator,
} from '../../../../shared/sequence';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  DOCUMENT_PRICING,
  SALES_REF_LOOKUP,
  SalesRefInvalidError,
  priceLines,
  type DocumentPricing,
  type LineRequest,
  type SalesRefLookup,
} from '../../shared';
import {
  Quotation,
  QuotationNotFoundError,
  QuotationVersionConflictError,
  type QuotationEvent,
  type QuotationStatus,
} from '../domain';

import { QUOTATION_OUTBOX, type QuotationOutbox } from './ports/outbox.port';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from './ports/quotation.repository';

export const QUOTATION_NUMBER_PREFIX = 'QT';
export const DEFAULT_VALIDITY_DAYS = 30;

export function resolvedEvent(
  q: Quotation,
  type: Extract<QuotationEvent, { reason: string | null }>['type'],
  actor: string,
  now: Date,
  reason: string | null = null,
): QuotationEvent {
  const s = q.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    number: s.number,
    revision: s.revision,
    customerId: s.customerId,
    totalMinor: s.totalMinor,
    currency: s.currency,
    actor,
    reason,
  };
}

/** Client-supplied version (If-Match semantics). Repo-level check still applies. */
function assertExpectedVersion(
  q: Quotation,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== q.version) {
    throw new QuotationVersionConflictError(q.id, expected, q.version);
  }
}

export interface CreateQuotationInput {
  readonly companyId: string;
  readonly customerId: string;
  readonly currency?: string | null;
  readonly quoteDate?: IsoDate | null;
  readonly validUntil?: IsoDate | null;
  readonly paymentTermsDays?: number | null;
  readonly notes?: string | null;
  readonly lines: readonly LineRequest[];
}

@Injectable()
export class CreateQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(DOCUMENT_PRICING) private readonly pricing: DocumentPricing,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateQuotationInput): Promise<Quotation> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const [company, customer] = await Promise.all([
      this.refs.findCompany(tenantId, input.companyId),
      this.refs.findCustomer(tenantId, input.customerId),
    ]);
    if (!company?.isActive) {
      throw new SalesRefInvalidError(
        `company ${input.companyId} does not exist or is inactive`,
      );
    }
    if (!customer?.isActive) {
      throw new SalesRefInvalidError(
        `customer ${input.customerId} does not exist or is inactive`,
      );
    }
    const currency = (input.currency ?? company.baseCurrency)
      .trim()
      .toUpperCase();
    if (!(await this.refs.currencyExists(tenantId, currency))) {
      throw new SalesRefInvalidError(`currency ${currency} is not configured`);
    }
    const quoteDate = input.quoteDate ?? toIsoDate(now);
    const lines = await priceLines(
      input.lines,
      { tenantId, customerId: customer.id, currency, date: now },
      { refs: this.refs, pricing: this.pricing, newId: randomUUID },
    );
    return this.tx.runInTransaction(async () => {
      const number = await this.numbers.next(
        tenantId,
        QUOTATION_NUMBER_PREFIX,
        now,
      );
      const q = Quotation.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number,
        customerId: customer.id,
        currency,
        quoteDate,
        validUntil:
          input.validUntil ?? addDays(quoteDate, DEFAULT_VALIDITY_DAYS),
        paymentTermsDays: input.paymentTermsDays ?? customer.paymentTermsDays,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(q);
      return q;
    });
  }
}

export interface UpdateQuotationInput {
  readonly quotationId: string;
  readonly expectedVersion?: number | null;
  readonly validUntil?: IsoDate;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
  /** When present, replaces every line (re-priced from scratch). */
  readonly lines?: readonly LineRequest[] | null;
}

/** DRAFT only. Lines are re-priced as of "now" — a stale draft picks up the current list. */
@Injectable()
export class UpdateQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(DOCUMENT_PRICING) private readonly pricing: DocumentPricing,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateQuotationInput): Promise<Quotation> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.quotationId);
      if (!current) throw new QuotationNotFoundError(input.quotationId);
      assertExpectedVersion(current, input.expectedVersion);
      let next = current.updateHeader(
        {
          validUntil: input.validUntil,
          paymentTermsDays: input.paymentTermsDays,
          notes: input.notes,
        },
        now,
      );
      if (input.lines) {
        const s = current.snapshot();
        const lines = await priceLines(
          input.lines,
          {
            tenantId,
            customerId: s.customerId,
            currency: s.currency,
            date: now,
          },
          { refs: this.refs, pricing: this.pricing, newId: randomUUID },
        );
        next = next.replaceLines(lines, now);
      }
      return this.repo.save(next);
    });
  }
}

export interface TransitionInput {
  readonly quotationId: string;
  readonly expectedVersion?: number | null;
  readonly reason?: string | null;
}

abstract class TransitionUseCase {
  constructor(
    protected readonly repo: QuotationRepository,
    protected readonly outbox: QuotationOutbox,
    protected readonly tx: TransactionManager,
    protected readonly tenant: TenantContext,
    protected readonly clock: Clock,
  ) {}

  protected abstract apply(
    q: Quotation,
    input: TransitionInput,
    now: Date,
  ): Quotation;
  protected abstract event(
    q: Quotation,
    input: TransitionInput,
    now: Date,
  ): QuotationEvent;
  protected abstract readonly suffix: string;

  async execute(input: TransitionInput): Promise<Quotation> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.quotationId);
      if (!current) throw new QuotationNotFoundError(input.quotationId);
      assertExpectedVersion(current, input.expectedVersion);
      const next = this.apply(current, input, now);
      const saved = await this.repo.save(next);
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:${this.suffix}:${String(saved.snapshot().revision)}`,
        event: this.event(saved, input, now),
      });
      return saved;
    });
  }
}

@Injectable()
export class SendQuotationUseCase extends TransitionUseCase {
  protected readonly suffix = 'sent';
  constructor(
    @Inject(QUOTATION_REPOSITORY) repo: QuotationRepository,
    @Inject(QUOTATION_OUTBOX) outbox: QuotationOutbox,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(repo, outbox, tx, tenant, clock);
  }
  protected apply(q: Quotation, _input: TransitionInput, now: Date): Quotation {
    return q.send(now);
  }
  protected event(
    q: Quotation,
    _input: TransitionInput,
    now: Date,
  ): QuotationEvent {
    const s = q.snapshot();
    return {
      type: 'quotation.sent.v1',
      aggregateId: s.id,
      tenantId: s.tenantId,
      occurredAt: now,
      number: s.number,
      revision: s.revision,
      customerId: s.customerId,
      totalMinor: s.totalMinor,
      currency: s.currency,
      actor: this.tenant.getUserId(),
      validUntil: s.validUntil,
    };
  }
}

@Injectable()
export class AcceptQuotationUseCase extends TransitionUseCase {
  protected readonly suffix = 'accepted';
  constructor(
    @Inject(QUOTATION_REPOSITORY) repo: QuotationRepository,
    @Inject(QUOTATION_OUTBOX) outbox: QuotationOutbox,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(repo, outbox, tx, tenant, clock);
  }
  protected apply(q: Quotation, _input: TransitionInput, now: Date): Quotation {
    return q.accept(now);
  }
  protected event(
    q: Quotation,
    _input: TransitionInput,
    now: Date,
  ): QuotationEvent {
    return resolvedEvent(
      q,
      'quotation.accepted.v1',
      this.tenant.getUserId(),
      now,
    );
  }
}

@Injectable()
export class RejectQuotationUseCase extends TransitionUseCase {
  protected readonly suffix = 'rejected';
  constructor(
    @Inject(QUOTATION_REPOSITORY) repo: QuotationRepository,
    @Inject(QUOTATION_OUTBOX) outbox: QuotationOutbox,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(repo, outbox, tx, tenant, clock);
  }
  protected apply(q: Quotation, input: TransitionInput, now: Date): Quotation {
    return q.reject(input.reason ?? null, now);
  }
  protected event(
    q: Quotation,
    _input: TransitionInput,
    now: Date,
  ): QuotationEvent {
    return resolvedEvent(
      q,
      'quotation.rejected.v1',
      this.tenant.getUserId(),
      now,
      q.snapshot().rejectReason,
    );
  }
}

@Injectable()
export class CancelQuotationUseCase extends TransitionUseCase {
  protected readonly suffix = 'cancelled';
  constructor(
    @Inject(QUOTATION_REPOSITORY) repo: QuotationRepository,
    @Inject(QUOTATION_OUTBOX) outbox: QuotationOutbox,
    @Inject(TRANSACTION_MANAGER) tx: TransactionManager,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(repo, outbox, tx, tenant, clock);
  }
  protected apply(q: Quotation, _input: TransitionInput, now: Date): Quotation {
    return q.cancel(now);
  }
  protected event(
    q: Quotation,
    input: TransitionInput,
    now: Date,
  ): QuotationEvent {
    return resolvedEvent(
      q,
      'quotation.cancelled.v1',
      this.tenant.getUserId(),
      now,
      (input.reason ?? '').trim() || null,
    );
  }
}

export interface ReviseQuotationInput {
  readonly quotationId: string;
  readonly validUntil?: IsoDate | null;
}

/** Cuts revision n+1 as a new DRAFT; the source revision is left untouched for audit. */
@Injectable()
export class ReviseQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ReviseQuotationInput): Promise<Quotation> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const source = await this.repo.findById(tenantId, input.quotationId);
      if (!source) throw new QuotationNotFoundError(input.quotationId);
      const latest = (
        await this.repo.findRevisions(tenantId, source.snapshot().number)
      )[0];
      if (latest && latest.id !== source.id) {
        throw new SalesRefInvalidError(
          `revision ${String(latest.snapshot().revision)} already exists for ${source.snapshot().number}; revise the latest one`,
        );
      }
      const q = Quotation.create(
        source.toRevisionProps({
          id: randomUUID(),
          lineIds: source.snapshot().lines.map(() => randomUUID()),
          createdBy: this.tenant.getUserId(),
          validUntil:
            input.validUntil ?? addDays(toIsoDate(now), DEFAULT_VALIDITY_DAYS),
          now,
        }),
      );
      await this.repo.create(q);
      return q;
    });
  }
}

@Injectable()
export class GetQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Quotation> {
    const q = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!q) throw new QuotationNotFoundError(id);
    return q;
  }
}

export interface ListQuotationsInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: QuotationStatus | null;
  readonly customerId?: string | null;
}

export interface ListQuotationsResult {
  readonly items: readonly Quotation[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListQuotationsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListQuotationsInput = {},
  ): Promise<ListQuotationsResult> {
    const limit = Math.max(
      1,
      Math.min(
        ListQuotationsUseCase.MAX_LIMIT,
        Math.trunc(input.limit ?? ListQuotationsUseCase.DEFAULT_LIMIT),
      ),
    );
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      status: input.status ?? null,
      customerId: input.customerId ?? null,
    });
    return { items, total, limit, offset };
  }
}
