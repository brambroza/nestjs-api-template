import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import {
  PriceSource,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  ArRefInvalidError,
  ArVersionConflictError,
  InvalidInvoiceError,
  InvoiceNotFoundError,
  InvoiceType,
  NothingToInvoiceError,
  SalesInvoice,
  buildPromptPayPayload,
  type CustomerIdentity,
  type InvoiceEvent,
  type InvoiceStatus,
  type NoteReason,
  type SalesInvoiceLineInput,
} from '../domain';

import {
  AR_OUTBOX,
  AR_POSTING_GATE,
  AR_REF_LOOKUP,
  AR_TAX,
  SALES_INVOICE_REPOSITORY,
  TAX_INVOICE_NUMBER_GENERATOR,
  type ArOutbox,
  type ArPostingGate,
  type ArRefLookup,
  type ArTax,
  type InvoiceFilter,
  type SalesInvoiceRepository,
  type TaxDocumentKind,
  type TaxInvoiceNumberGenerator,
} from './ports';

function assertVersion(
  inv: SalesInvoice,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== inv.version) {
    throw new ArVersionConflictError(inv.id, expected, inv.version);
  }
}

function invoiceEvent(
  inv: SalesInvoice,
  type: InvoiceEvent['type'],
  actor: string,
  now: Date,
): InvoiceEvent {
  const s = inv.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    customerId: s.customerId,
    amountMinor: s.totalMinor,
    currency: s.currency,
    actor,
    number: s.number ?? '',
    companyId: s.companyId,
    branchId: s.branchId,
    invoiceDate: s.invoiceDate,
    dueDate: s.dueDate,
    taxMinor: s.taxMinor,
    originalInvoiceId: s.originalInvoiceId,
  };
}

/** Resolves company/branch/customer and freezes the customer identity for the tax invoice. */
async function resolveParties(
  refs: ArRefLookup,
  tenantId: string,
  companyId: string,
  branchId: string | null,
  customerId: string,
): Promise<{
  companyId: string;
  branchId: string;
  currency: string;
  identity: CustomerIdentity;
  paymentTermsDays: number;
}> {
  const company = await refs.findCompany(tenantId, companyId);
  if (!company?.isActive)
    throw new ArRefInvalidError(
      `company ${companyId} does not exist or is inactive`,
    );
  const branch = branchId
    ? await refs.findBranch(tenantId, branchId)
    : await refs.findHeadOfficeBranch(tenantId, company.id);
  if (!branch?.isActive || branch.companyId !== company.id) {
    throw new ArRefInvalidError(
      `branch ${branchId ?? '(head office)'} is not an active branch of company ${company.id}`,
    );
  }
  const customer = await refs.findCustomer(tenantId, customerId);
  if (!customer?.isActive)
    throw new ArRefInvalidError(
      `customer ${customerId} does not exist or is inactive`,
    );
  const billing = await refs.findBillingAddress(tenantId, customer.id);
  return {
    companyId: company.id,
    branchId: branch.id,
    currency: company.baseCurrency,
    paymentTermsDays: customer.paymentTermsDays,
    identity: {
      customerId: customer.id,
      customerName: customer.name,
      customerTaxId: customer.taxId,
      customerBranchNumber: billing?.branchNumber ?? null,
      billingAddress: billing?.text ?? null,
    },
  };
}

export interface ManualLineRequest {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly unitPriceMinor: bigint;
  readonly uomCode?: string | null;
  readonly description?: string | null;
  readonly discountBp?: number;
}

async function buildManualLines(
  requests: readonly ManualLineRequest[],
  tenantId: string,
  refs: ArRefLookup,
  tax: ArTax,
): Promise<SalesInvoiceLineInput[]> {
  const out: SalesInvoiceLineInput[] = [];
  for (const r of requests) {
    const item = await refs.findItem(tenantId, r.itemId);
    if (!item?.isActive)
      throw new ArRefInvalidError(
        `item ${r.itemId} does not exist or is inactive`,
      );
    const vat = await tax.resolveVat(item.id);
    out.push({
      id: randomUUID(),
      itemId: item.id,
      itemSku: item.sku,
      description: (r.description ?? '').trim() || item.name,
      uomCode: (r.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode,
      quantity: r.quantity,
      unitPriceMinor: r.unitPriceMinor,
      priceSource: PriceSource.Manual,
      priceListId: null,
      discountBp: r.discountBp ?? 0,
      taxCodeId: vat.taxCodeId,
      taxCode: vat.taxCode,
      taxRateBp: vat.rateBasisPoints,
      salesOrderLineId: null,
    });
  }
  return out;
}

export interface CreateInvoiceFromSalesOrderInput {
  readonly salesOrderId: string;
  readonly branchId?: string | null;
  readonly invoiceDate?: IsoDate | null;
  /** Subset of delivered lines; default = everything delivered and not yet invoiced. */
  readonly lines?: ReadonlyArray<{
    readonly salesOrderLineId: string;
    readonly quantity: bigint;
  }> | null;
  readonly notes?: string | null;
}

/** T-330: bill what was delivered (delivered − already invoiced), at the order's prices. */
@Injectable()
export class CreateInvoiceFromSalesOrderUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateInvoiceFromSalesOrderInput,
  ): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const so = await this.refs.findSalesOrderForInvoicing(
        tenantId,
        input.salesOrderId,
      );
      if (!so)
        throw new ArRefInvalidError(
          `sales order ${input.salesOrderId} does not exist`,
        );
      const invoiced = await this.repo.invoicedQtyBySalesOrderLine(
        tenantId,
        so.id,
      );
      const requested = input.lines
        ? new Map(input.lines.map((l) => [l.salesOrderLineId, l.quantity]))
        : null;
      const lines: SalesInvoiceLineInput[] = [];
      for (const l of so.lines) {
        const open = l.deliveredQty - (invoiced.get(l.id) ?? 0n);
        const qty = requested ? (requested.get(l.id) ?? 0n) : open;
        if (qty <= 0n) continue;
        if (qty > open) {
          throw new InvalidInvoiceError(
            `line ${l.id}: ${qty.toString()} requested but only ${open.toString()} delivered and un-invoiced`,
          );
        }
        lines.push({
          id: randomUUID(),
          itemId: l.itemId,
          itemSku: l.itemSku,
          description: l.description,
          uomCode: l.uomCode,
          quantity: qty,
          unitPriceMinor: l.unitPriceMinor,
          priceSource:
            l.priceSource === 'PRICE_LIST'
              ? PriceSource.PriceList
              : PriceSource.Manual,
          priceListId: l.priceListId,
          discountBp: l.discountBp,
          taxCodeId: l.taxCodeId,
          taxCode: l.taxCode,
          taxRateBp: l.taxRateBp,
          salesOrderLineId: l.id,
        });
      }
      if (lines.length === 0) throw new NothingToInvoiceError(so.id);
      const parties = await resolveParties(
        this.refs,
        tenantId,
        so.companyId,
        input.branchId ?? null,
        so.customerId,
      );
      const inv = SalesInvoice.create({
        id: randomUUID(),
        tenantId,
        companyId: parties.companyId,
        branchId: parties.branchId,
        ...parties.identity,
        salesOrderId: so.id,
        currency: so.currency,
        invoiceDate: input.invoiceDate ?? toIsoDate(now),
        paymentTermsDays: so.paymentTermsDays,
        notes: input.notes ?? `Sales order ${so.number}`,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(inv);
      return inv;
    });
  }
}

export interface CreateManualInvoiceInput {
  readonly companyId: string;
  readonly branchId?: string | null;
  readonly customerId: string;
  readonly currency?: string | null;
  readonly invoiceDate?: IsoDate | null;
  readonly paymentTermsDays?: number | null;
  readonly notes?: string | null;
  readonly lines: readonly ManualLineRequest[];
}

@Injectable()
export class CreateManualInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(AR_TAX) private readonly tax: ArTax,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateManualInvoiceInput): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const parties = await resolveParties(
      this.refs,
      tenantId,
      input.companyId,
      input.branchId ?? null,
      input.customerId,
    );
    const lines = await buildManualLines(
      input.lines,
      tenantId,
      this.refs,
      this.tax,
    );
    return this.tx.runInTransaction(async () => {
      const inv = SalesInvoice.create({
        id: randomUUID(),
        tenantId,
        companyId: parties.companyId,
        branchId: parties.branchId,
        ...parties.identity,
        currency: (input.currency ?? parties.currency).trim().toUpperCase(),
        invoiceDate: input.invoiceDate ?? toIsoDate(now),
        paymentTermsDays: input.paymentTermsDays ?? parties.paymentTermsDays,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(inv);
      return inv;
    });
  }
}

export interface UpdateInvoiceInput {
  readonly invoiceId: string;
  readonly expectedVersion?: number | null;
  readonly invoiceDate?: IsoDate;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
  readonly lines?: readonly ManualLineRequest[] | null;
}

@Injectable()
export class UpdateInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(AR_TAX) private readonly tax: ArTax,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateInvoiceInput): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.invoiceId);
      if (!current) throw new InvoiceNotFoundError(input.invoiceId);
      assertVersion(current, input.expectedVersion);
      let next = current.updateHeader(
        {
          invoiceDate: input.invoiceDate,
          paymentTermsDays: input.paymentTermsDays,
          notes: input.notes,
        },
        now,
      );
      if (input.lines) {
        next = next.replaceLines(
          await buildManualLines(input.lines, tenantId, this.refs, this.tax),
          now,
        );
      }
      return this.repo.save(next);
    });
  }
}

export interface InvoiceActionInput {
  readonly invoiceId: string;
  readonly expectedVersion?: number | null;
  readonly reason?: string | null;
}

const KIND_OF: Readonly<Record<InvoiceType, TaxDocumentKind>> = {
  INVOICE: 'IV',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
};

/** T-331: posting gate, then the gapless number, then ISSUED — all in one transaction. */
@Injectable()
export class IssueInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(TAX_INVOICE_NUMBER_GENERATOR)
    private readonly numbers: TaxInvoiceNumberGenerator,
    @Inject(AR_POSTING_GATE) private readonly gate: ArPostingGate,
    @Inject(AR_OUTBOX) private readonly outbox: ArOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: InvoiceActionInput): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.invoiceId);
      if (!current) throw new InvoiceNotFoundError(input.invoiceId);
      assertVersion(current, input.expectedVersion);
      const s = current.snapshot();
      await this.gate.assertOpen(s.companyId, s.invoiceDate);
      const branch = await this.refs.findBranch(tenantId, s.branchId);
      if (!branch)
        throw new ArRefInvalidError(`branch ${s.branchId} does not exist`);
      const number = await this.numbers.next(
        tenantId,
        KIND_OF[s.type],
        branch.id,
        branch.branchNumber,
        s.invoiceDate,
      );
      const saved = await this.repo.save(current.issue(number, now));
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:issued`,
        event: invoiceEvent(
          saved,
          s.type === InvoiceType.CreditNote
            ? 'credit_note.issued.v1'
            : s.type === InvoiceType.DebitNote
              ? 'debit_note.issued.v1'
              : 'sales_invoice.issued.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
      return saved;
    });
  }
}

@Injectable()
export class VoidInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_POSTING_GATE) private readonly gate: ArPostingGate,
    @Inject(AR_OUTBOX) private readonly outbox: ArOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: InvoiceActionInput): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.invoiceId);
      if (!current) throw new InvoiceNotFoundError(input.invoiceId);
      assertVersion(current, input.expectedVersion);
      if (current.status !== 'DRAFT')
        await this.gate.assertOpen(
          current.snapshot().companyId,
          toIsoDate(now),
        );
      const saved = await this.repo.save(current.void(input.reason ?? '', now));
      if (saved.snapshot().number) {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:voided`,
          event: invoiceEvent(
            saved,
            'sales_invoice.voided.v1',
            this.tenant.getUserId(),
            now,
          ),
        });
      }
      return saved;
    });
  }
}

export interface CreateNoteInput {
  readonly invoiceId: string;
  readonly reason: NoteReason;
  readonly reasonText?: string | null;
  readonly noteDate?: IsoDate | null;
  /** Lines of the original to credit/debit (quantity ≤ original for credit notes). */
  readonly lines: ReadonlyArray<{
    readonly invoiceLineId: string;
    readonly quantity: bigint;
    readonly unitPriceMinor?: bigint | null;
  }>;
}

/**
 * T-332. A credit note is issued at once with its own CN number and
 * applied to the original (never beyond its open balance); a debit
 * note is issued as a new receivable referencing the original.
 */
@Injectable()
export class CreateNoteUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(TAX_INVOICE_NUMBER_GENERATOR)
    private readonly numbers: TaxInvoiceNumberGenerator,
    @Inject(AR_POSTING_GATE) private readonly gate: ArPostingGate,
    @Inject(AR_OUTBOX) private readonly outbox: ArOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    type: 'CREDIT_NOTE' | 'DEBIT_NOTE',
    input: CreateNoteInput,
  ): Promise<SalesInvoice> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const original = await this.repo.findById(tenantId, input.invoiceId);
      if (!original) throw new InvoiceNotFoundError(input.invoiceId);
      const os = original.snapshot();
      if (
        os.type !== InvoiceType.Invoice ||
        os.number === null ||
        os.status === 'VOID'
      ) {
        throw new InvalidInvoiceError(
          'notes can only reference an issued invoice',
        );
      }
      const lines: SalesInvoiceLineInput[] = input.lines.map((r) => {
        const l = os.lines.find((x) => x.id === r.invoiceLineId);
        if (!l)
          throw new InvalidInvoiceError(
            `line ${r.invoiceLineId} is not on invoice ${os.number ?? os.id}`,
          );
        if (type === 'CREDIT_NOTE' && r.quantity > l.quantity) {
          throw new InvalidInvoiceError(
            `line ${l.id}: cannot credit more than the invoiced ${l.quantity.toString()}`,
          );
        }
        return {
          id: randomUUID(),
          itemId: l.itemId,
          itemSku: l.itemSku,
          description: l.description,
          uomCode: l.uomCode,
          quantity: r.quantity,
          unitPriceMinor: r.unitPriceMinor ?? l.unitPriceMinor,
          priceSource: PriceSource.Manual,
          priceListId: null,
          discountBp: l.discountBp,
          taxCodeId: l.taxCodeId,
          taxCode: l.taxCode,
          taxRateBp: l.taxRateBp,
          salesOrderLineId: l.salesOrderLineId,
        };
      });
      const noteDate = input.noteDate ?? toIsoDate(now);
      await this.gate.assertOpen(os.companyId, noteDate);
      const draft = SalesInvoice.create({
        id: randomUUID(),
        tenantId,
        companyId: os.companyId,
        branchId: os.branchId,
        type,
        originalInvoiceId: os.id,
        reason: input.reason,
        reasonText: input.reasonText,
        customerId: os.customerId,
        customerName: os.customerName,
        customerTaxId: os.customerTaxId,
        customerBranchNumber: os.customerBranchNumber,
        billingAddress: os.billingAddress,
        salesOrderId: os.salesOrderId,
        currency: os.currency,
        invoiceDate: noteDate,
        paymentTermsDays: type === 'CREDIT_NOTE' ? 0 : os.paymentTermsDays,
        notes: `${type === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} note for ${os.number}`,
        createdBy: userId,
        lines,
        now,
      });
      const branch = await this.refs.findBranch(tenantId, os.branchId);
      if (!branch)
        throw new ArRefInvalidError(`branch ${os.branchId} does not exist`);
      const number = await this.numbers.next(
        tenantId,
        KIND_OF[type],
        branch.id,
        branch.branchNumber,
        noteDate,
      );
      let note = draft.issue(number, now);
      if (type === 'CREDIT_NOTE') {
        await this.repo.save(
          original.applySettlement(note.snapshot().totalMinor, now),
        );
        note = note.markApplied(now);
      }
      await this.repo.create(note);
      await this.outbox.enqueue({
        idempotencyKey: `${note.id}:issued`,
        event: invoiceEvent(
          note,
          type === 'CREDIT_NOTE'
            ? 'credit_note.issued.v1'
            : 'debit_note.issued.v1',
          userId,
          now,
        ),
      });
      return note;
    });
  }
}

@Injectable()
export class GetInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<SalesInvoice> {
    const inv = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!inv) throw new InvoiceNotFoundError(id);
    return inv;
  }
}

@Injectable()
export class ListInvoicesUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    input: Omit<InvoiceFilter, 'limit' | 'offset'> & {
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.repo.list(this.tenant.getTenantId(), {
      ...input,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}

/** T-334: the PromptPay payload for the invoice's open balance, from the company's proxy. */
@Injectable()
export class PromptPayForInvoiceUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly repo: SalesInvoiceRepository,
    @Inject(AR_REF_LOOKUP) private readonly refs: ArRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    invoiceId: string,
  ): Promise<{ payload: string; amountMinor: bigint; proxy: string }> {
    const tenantId = this.tenant.getTenantId();
    const inv = await this.repo.findById(tenantId, invoiceId);
    if (!inv) throw new InvoiceNotFoundError(invoiceId);
    const company = await this.refs.findCompany(
      tenantId,
      inv.snapshot().companyId,
    );
    if (!company?.promptPayId)
      throw new ArRefInvalidError('the company has no PromptPay id configured');
    const amountMinor = inv.snapshot().balanceMinor;
    return {
      payload: buildPromptPayPayload({
        proxy: company.promptPayId,
        amountMinor: amountMinor > 0n ? amountMinor : null,
      }),
      amountMinor,
      proxy: company.promptPayId,
    };
  }
}

export type { InvoiceStatus };
