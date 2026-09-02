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
import {
  ArRefInvalidError,
  ArVersionConflictError,
  InvalidReceiptError,
  InvoiceNotFoundError,
  Receipt,
  ReceiptNotFoundError,
  proposeAllocations,
  type AllocationSnapshot,
  type MatchProposal,
  type ReceiptEvent,
  type ReceiptMethod,
} from '../domain';

import {
  AR_OUTBOX,
  AR_POSTING_GATE,
  AR_REF_LOOKUP,
  RECEIPT_REPOSITORY,
  SALES_INVOICE_REPOSITORY,
  type ArOutbox,
  type ArPostingGate,
  type ArRefLookup,
  type ReceiptFilter,
  type ReceiptRepository,
  type SalesInvoiceRepository,
} from './ports';

export const RECEIPT_NUMBER_PREFIX = 'RC';

function assertVersion(r: Receipt, expected: number | null | undefined): void {
  if (expected !== null && expected !== undefined && expected !== r.version) {
    throw new ArVersionConflictError(r.id, expected, r.version);
  }
}

function receiptEvent(
  r: Receipt,
  type: ReceiptEvent['type'],
  actor: string,
  now: Date,
): ReceiptEvent {
  const s = r.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    customerId: s.customerId,
    amountMinor: s.amountMinor,
    currency: s.currency,
    actor,
    number: s.number,
    companyId: s.companyId,
    method: s.method,
    whtMinor: s.whtMinor,
    allocations: s.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: a.amountMinor,
    })),
  };
}

export interface CreateReceiptInput {
  readonly companyId: string;
  readonly customerId: string;
  readonly method: ReceiptMethod;
  readonly amountMinor: bigint;
  readonly whtMinor?: bigint | null;
  readonly currency?: string | null;
  readonly receiptDate?: IsoDate | null;
  readonly reference?: string | null;
  readonly chequeNumber?: string | null;
  readonly chequeBank?: string | null;
  readonly chequeDate?: IsoDate | null;
  readonly notes?: string | null;
  readonly allocations?: ReadonlyArray<{
    readonly invoiceId: string;
    readonly amountMinor: bigint;
  }> | null;
  /** T-336: propose allocations from reference / amount / FIFO when none are given. */
  readonly autoMatch?: boolean;
}

@Injectable()
export class CreateReceiptUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateReceiptInput): Promise<Receipt> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const company = await this.refs.findCompany(tenantId, input.companyId);
    if (!company?.isActive)
      throw new ArRefInvalidError(
        `company ${input.companyId} does not exist or is inactive`,
      );
    const customer = await this.refs.findCustomer(tenantId, input.customerId);
    if (!customer?.isActive)
      throw new ArRefInvalidError(
        `customer ${input.customerId} does not exist or is inactive`,
      );
    return this.tx.runInTransaction(async () => {
      let allocations: AllocationSnapshot[] = (input.allocations ?? []).map(
        (a) => ({
          id: randomUUID(),
          invoiceId: a.invoiceId,
          amountMinor: a.amountMinor,
        }),
      );
      const settlement = input.amountMinor + (input.whtMinor ?? 0n);
      if (allocations.length === 0 && input.autoMatch) {
        const open = await this.invoices.listOpen(tenantId, customer.id);
        const proposal = proposeAllocations(
          settlement,
          input.reference ?? null,
          open.map((i) => ({
            invoiceId: i.id,
            number: i.snapshot().number,
            dueDate: i.snapshot().dueDate,
            balanceMinor: i.snapshot().balanceMinor,
          })),
        );
        allocations = proposal.allocations.map((a) => ({
          id: randomUUID(),
          invoiceId: a.invoiceId,
          amountMinor: a.amountMinor,
        }));
      }
      for (const a of allocations) {
        const inv = await this.invoices.findById(tenantId, a.invoiceId);
        if (!inv) throw new InvoiceNotFoundError(a.invoiceId);
        const s = inv.snapshot();
        if (s.customerId !== customer.id)
          throw new InvalidReceiptError(
            `invoice ${s.number ?? s.id} belongs to another customer`,
          );
        if (!inv.isOpen || a.amountMinor > s.balanceMinor) {
          throw new InvalidReceiptError(
            `invoice ${s.number ?? s.id} cannot take ${a.amountMinor.toString()} (open balance ${s.balanceMinor.toString()})`,
          );
        }
      }
      const r = Receipt.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(tenantId, RECEIPT_NUMBER_PREFIX, now),
        customerId: customer.id,
        currency: input.currency ?? company.baseCurrency,
        receiptDate: input.receiptDate ?? toIsoDate(now),
        method: input.method,
        amountMinor: input.amountMinor,
        whtMinor: input.whtMinor ?? 0n,
        reference: input.reference,
        chequeNumber: input.chequeNumber,
        chequeBank: input.chequeBank,
        chequeDate: input.chequeDate ?? null,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        allocations,
        now,
      });
      await this.receipts.create(r);
      return r;
    });
  }
}

export interface ReceiptActionInput {
  readonly receiptId: string;
  readonly expectedVersion?: number | null;
}

/** Applies every allocation to its invoice and posts the receipt, behind the period gate. */
@Injectable()
export class PostReceiptUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(AR_POSTING_GATE) private readonly gate: ArPostingGate,
    @Inject(AR_OUTBOX) private readonly outbox: ArOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ReceiptActionInput): Promise<Receipt> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const r = await this.receipts.findById(tenantId, input.receiptId);
      if (!r) throw new ReceiptNotFoundError(input.receiptId);
      assertVersion(r, input.expectedVersion);
      const s = r.snapshot();
      await this.gate.assertOpen(s.companyId, s.receiptDate);
      for (const a of s.allocations) {
        const inv = await this.invoices.findById(tenantId, a.invoiceId);
        if (!inv) throw new InvoiceNotFoundError(a.invoiceId);
        await this.invoices.save(inv.applySettlement(a.amountMinor, now));
      }
      const posted = await this.receipts.save(r.post(now));
      await this.outbox.enqueue({
        idempotencyKey: `${posted.id}:posted`,
        event: receiptEvent(
          posted,
          'receipt.posted.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
      return posted;
    });
  }
}

@Injectable()
export class VoidReceiptUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(AR_POSTING_GATE) private readonly gate: ArPostingGate,
    @Inject(AR_OUTBOX) private readonly outbox: ArOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ReceiptActionInput): Promise<Receipt> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const r = await this.receipts.findById(tenantId, input.receiptId);
      if (!r) throw new ReceiptNotFoundError(input.receiptId);
      assertVersion(r, input.expectedVersion);
      const wasPosted = r.status === 'POSTED';
      if (wasPosted) {
        await this.gate.assertOpen(r.snapshot().companyId, toIsoDate(now));
        for (const a of r.snapshot().allocations) {
          const inv = await this.invoices.findById(tenantId, a.invoiceId);
          if (!inv) throw new InvoiceNotFoundError(a.invoiceId);
          await this.invoices.save(inv.reverseSettlement(a.amountMinor, now));
        }
      }
      const voided = await this.receipts.save(r.void(now));
      if (wasPosted) {
        await this.outbox.enqueue({
          idempotencyKey: `${voided.id}:voided`,
          event: receiptEvent(
            voided,
            'receipt.voided.v1',
            this.tenant.getUserId(),
            now,
          ),
        });
      }
      return voided;
    });
  }
}

@Injectable()
export class GetReceiptUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<Receipt> {
    const r = await this.receipts.findById(this.tenant.getTenantId(), id);
    if (!r) throw new ReceiptNotFoundError(id);
    return r;
  }
}

@Injectable()
export class ListReceiptsUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    input: Omit<ReceiptFilter, 'limit' | 'offset'> & {
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.receipts.list(this.tenant.getTenantId(), {
      ...input,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}

@Injectable()
export class AutoMatchPreviewUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(input: {
    customerId: string;
    settlementMinor: bigint;
    reference?: string | null;
  }): Promise<MatchProposal> {
    const open = await this.invoices.listOpen(
      this.tenant.getTenantId(),
      input.customerId,
    );
    return proposeAllocations(
      input.settlementMinor,
      input.reference ?? null,
      open.map((i) => ({
        invoiceId: i.id,
        number: i.snapshot().number,
        dueDate: i.snapshot().dueDate,
        balanceMinor: i.snapshot().balanceMinor,
      })),
    );
  }
}
