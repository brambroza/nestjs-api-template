import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import {
  PriceSource,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
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
  ApRefInvalidError,
  ApVersionConflictError,
  InvalidVendorInvoiceError,
  VendorInvoice,
  VendorInvoiceNotFoundError,
  threeWayMatch,
  type MatchLineInput,
  type VendorInvoiceEvent,
  type VendorInvoiceLineInput,
} from '../domain';

import {
  AP_OUTBOX,
  AP_POSTING_GATE,
  AP_REF_LOOKUP,
  AP_TAX,
  VENDOR_INVOICE_REPOSITORY,
  type ApOutbox,
  type ApPostingGate,
  type ApRefLookup,
  type ApTax,
  type VendorInvoiceFilter,
  type VendorInvoiceRepository,
} from './ports';

export const VENDOR_INVOICE_NUMBER_PREFIX = 'AP';

function assertVersion(
  inv: VendorInvoice,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== inv.version) {
    throw new ApVersionConflictError(inv.id, expected, inv.version);
  }
}

export function invoiceEvent(
  inv: VendorInvoice,
  type: VendorInvoiceEvent['type'],
  actor: string,
  now: Date,
): VendorInvoiceEvent {
  const s = inv.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    companyId: s.companyId,
    vendorId: s.vendorId,
    amountMinor: s.totalMinor,
    currency: s.currency,
    actor,
    number: s.number,
    invoiceDate: s.invoiceDate,
    dueDate: s.dueDate,
    taxMinor: s.taxMinor,
    matchStatus: s.matchStatus,
  };
}

export interface VendorInvoiceLineRequest {
  readonly purchaseOrderLineId?: string | null;
  /** Required when the line is not tied to a PO line. */
  readonly itemId?: string | null;
  readonly quantity: bigint;
  readonly unitPriceMinor?: bigint | null;
  readonly description?: string | null;
  readonly discountBp?: number;
  readonly whtTaxCodeId?: string | null;
}

export interface CreateVendorInvoiceInput {
  readonly companyId?: string | null;
  readonly vendorId?: string | null;
  readonly vendorInvoiceNumber: string;
  readonly purchaseOrderId?: string | null;
  readonly invoiceDate?: IsoDate | null;
  readonly paymentTermsDays?: number | null;
  readonly currency?: string | null;
  readonly notes?: string | null;
  /** Omit with a purchaseOrderId to bill everything received and not yet invoiced. */
  readonly lines?: readonly VendorInvoiceLineRequest[] | null;
  readonly priceToleranceBp?: number | null;
}

/** T-340: capture the vendor's invoice and run the three-way match against PO + receipts. */
@Injectable()
export class CreateVendorInvoiceUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly repo: VendorInvoiceRepository,
    @Inject(AP_REF_LOOKUP) private readonly refs: ApRefLookup,
    @Inject(AP_TAX) private readonly tax: ApTax,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateVendorInvoiceInput): Promise<VendorInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const po = input.purchaseOrderId
        ? await this.refs.findPurchaseOrderForMatching(
            tenantId,
            input.purchaseOrderId,
          )
        : null;
      if (input.purchaseOrderId && !po)
        throw new ApRefInvalidError(
          `purchase order ${input.purchaseOrderId} does not exist`,
        );
      const companyId = po?.companyId ?? input.companyId ?? '';
      const vendorId = po?.vendorId ?? input.vendorId ?? '';
      const [company, vendor] = await Promise.all([
        this.refs.findCompany(tenantId, companyId),
        this.refs.findVendor(tenantId, vendorId),
      ]);
      if (!company?.isActive)
        throw new ApRefInvalidError(
          `company ${companyId} does not exist or is inactive`,
        );
      if (!vendor?.isActive)
        throw new ApRefInvalidError(
          `vendor ${vendorId} does not exist or is inactive`,
        );
      const invoiced = po
        ? await this.repo.invoicedQtyByPurchaseOrderLine(tenantId, po.id)
        : new Map<string, bigint>();
      const requests: readonly VendorInvoiceLineRequest[] =
        input.lines ??
        (po?.lines ?? [])
          .filter((l) => l.receivedQty - (invoiced.get(l.id) ?? 0n) > 0n)
          .map((l) => ({
            purchaseOrderLineId: l.id,
            quantity: l.receivedQty - (invoiced.get(l.id) ?? 0n),
          }));
      if (requests.length === 0)
        throw new InvalidVendorInvoiceError('nothing to invoice');

      const lines: VendorInvoiceLineInput[] = [];
      const matchLines: MatchLineInput[] = [];
      for (const r of requests) {
        const poLine = r.purchaseOrderLineId
          ? po?.lines.find((l) => l.id === r.purchaseOrderLineId)
          : undefined;
        if (r.purchaseOrderLineId && !poLine)
          throw new ApRefInvalidError(
            `PO line ${r.purchaseOrderLineId} is not on ${po?.number ?? 'the PO'}`,
          );
        const itemId = poLine?.itemId ?? r.itemId ?? '';
        const item = await this.refs.findItem(tenantId, itemId);
        if (!item?.isActive)
          throw new ApRefInvalidError(
            `item ${itemId} does not exist or is inactive`,
          );
        const unitPriceMinor = r.unitPriceMinor ?? poLine?.unitPriceMinor;
        if (unitPriceMinor === undefined || unitPriceMinor === null)
          throw new InvalidVendorInvoiceError(
            `item ${item.sku}: unit price is required`,
          );
        const vat = poLine
          ? {
              taxCodeId: poLine.taxCodeId,
              taxCode: poLine.taxCode,
              rateBasisPoints: poLine.taxRateBp,
            }
          : await this.tax.resolveVat(item.id);
        const wht = r.whtTaxCodeId
          ? await this.tax.findWhtCode(r.whtTaxCodeId)
          : null;
        if (r.whtTaxCodeId && !wht)
          throw new ApRefInvalidError(
            `WHT tax code ${r.whtTaxCodeId} does not exist`,
          );
        const id = randomUUID();
        lines.push({
          id,
          itemId: item.id,
          itemSku: item.sku,
          description:
            (r.description ?? '').trim() || poLine?.description || item.name,
          uomCode: poLine?.uomCode ?? item.defaultUomCode,
          quantity: r.quantity,
          unitPriceMinor,
          priceSource: PriceSource.Manual,
          priceListId: null,
          discountBp: r.discountBp ?? poLine?.discountBp ?? 0,
          taxCodeId: vat.taxCodeId,
          taxCode: vat.taxCode,
          taxRateBp: vat.rateBasisPoints,
          purchaseOrderLineId: poLine?.id ?? null,
          whtTaxCodeId: wht?.id ?? null,
          whtTaxCode: wht?.code ?? null,
          whtRateBp: wht?.rateBasisPoints ?? 0,
          whtPndForm: wht?.pndForm ?? null,
          whtIncomeType: wht?.incomeType ?? null,
        });
        matchLines.push({
          lineRef: item.sku,
          invoicedQty: r.quantity,
          invoicedUnitPriceMinor: unitPriceMinor,
          po: poLine
            ? {
                orderedQty: poLine.quantity,
                unitPriceMinor: poLine.unitPriceMinor,
                receivedQty: poLine.receivedQty,
                alreadyInvoicedQty: invoiced.get(poLine.id) ?? 0n,
              }
            : null,
        });
      }
      const inv = VendorInvoice.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(
          tenantId,
          VENDOR_INVOICE_NUMBER_PREFIX,
          now,
        ),
        vendorInvoiceNumber: input.vendorInvoiceNumber,
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorTaxId: vendor.taxId,
        purchaseOrderId: po?.id ?? null,
        currency: (
          input.currency ??
          po?.currency ??
          company.baseCurrency
        ).toUpperCase(),
        invoiceDate: input.invoiceDate ?? toIsoDate(now),
        paymentTermsDays:
          input.paymentTermsDays ??
          po?.paymentTermsDays ??
          vendor.paymentTermsDays,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        match: threeWayMatch(matchLines, input.priceToleranceBp ?? undefined),
        now,
      });
      await this.repo.create(inv);
      return inv;
    });
  }
}

export interface VendorInvoiceActionInput {
  readonly invoiceId: string;
  readonly expectedVersion?: number | null;
  readonly acceptVariance?: boolean;
  readonly reason?: string | null;
}

@Injectable()
export class PostVendorInvoiceUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly repo: VendorInvoiceRepository,
    @Inject(AP_POSTING_GATE) private readonly gate: ApPostingGate,
    @Inject(AP_OUTBOX) private readonly outbox: ApOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: VendorInvoiceActionInput): Promise<VendorInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const inv = await this.repo.findById(tenantId, input.invoiceId);
      if (!inv) throw new VendorInvoiceNotFoundError(input.invoiceId);
      assertVersion(inv, input.expectedVersion);
      await this.gate.assertOpen(
        inv.snapshot().companyId,
        inv.snapshot().invoiceDate,
      );
      const saved = await this.repo.save(
        inv.post(now, input.acceptVariance ?? false),
      );
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:posted`,
        event: invoiceEvent(
          saved,
          'vendor_invoice.posted.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
      return saved;
    });
  }
}

@Injectable()
export class VoidVendorInvoiceUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly repo: VendorInvoiceRepository,
    @Inject(AP_POSTING_GATE) private readonly gate: ApPostingGate,
    @Inject(AP_OUTBOX) private readonly outbox: ApOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: VendorInvoiceActionInput): Promise<VendorInvoice> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const inv = await this.repo.findById(tenantId, input.invoiceId);
      if (!inv) throw new VendorInvoiceNotFoundError(input.invoiceId);
      assertVersion(inv, input.expectedVersion);
      const wasOpen = inv.status === 'OPEN';
      if (wasOpen)
        await this.gate.assertOpen(inv.snapshot().companyId, toIsoDate(now));
      const saved = await this.repo.save(inv.void(input.reason ?? '', now));
      if (wasOpen)
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:voided`,
          event: invoiceEvent(
            saved,
            'vendor_invoice.voided.v1',
            this.tenant.getUserId(),
            now,
          ),
        });
      return saved;
    });
  }
}

@Injectable()
export class GetVendorInvoiceUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly repo: VendorInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<VendorInvoice> {
    const inv = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!inv) throw new VendorInvoiceNotFoundError(id);
    return inv;
  }
}

@Injectable()
export class ListVendorInvoicesUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly repo: VendorInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    input: Omit<VendorInvoiceFilter, 'limit' | 'offset'> & {
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
