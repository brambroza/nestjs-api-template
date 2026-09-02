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
  ApRefInvalidError,
  ApVersionConflictError,
  BatchNotFoundError,
  CertificateNotFoundError,
  InvalidBatchError,
  InvalidVoucherError,
  PaymentBatch,
  PaymentVoucher,
  VendorInvoiceNotFoundError,
  VoucherNotFoundError,
  buildCertificateLines,
  computeWhtMinor,
  proratedBase,
  type PaymentAllocationSnapshot,
  type PaymentEvent,
  type PaymentMethod,
  type VendorInvoice,
  type WhtCertificateSnapshot,
  type WhtLineInput,
} from '../domain';

import {
  AP_OUTBOX,
  AP_POSTING_GATE,
  AP_REF_LOOKUP,
  PAYMENT_BATCH_REPOSITORY,
  PAYMENT_VOUCHER_REPOSITORY,
  VENDOR_INVOICE_REPOSITORY,
  WHT_CERTIFICATE_REPOSITORY,
  type ApOutbox,
  type ApPostingGate,
  type ApRefLookup,
  type PaymentBatchRepository,
  type PaymentVoucherRepository,
  type VendorInvoiceRepository,
  type VoucherFilter,
  type WhtCertificateRepository,
} from './ports';

export const VOUCHER_NUMBER_PREFIX = 'PV';
export const BATCH_NUMBER_PREFIX = 'PB';
export const WHT_CERT_NUMBER_PREFIX = 'WHT';

function assertVersion(
  id: string,
  version: number,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== version)
    throw new ApVersionConflictError(id, expected, version);
}

function paymentEvent(
  v: PaymentVoucher,
  type: PaymentEvent['type'],
  actor: string,
  now: Date,
): PaymentEvent {
  const s = v.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    companyId: s.companyId,
    vendorId: s.vendorId,
    amountMinor: s.grossMinor,
    currency: s.currency,
    actor,
    number: s.number,
    method: s.method,
    whtMinor: s.whtMinor,
    netPaidMinor: s.netPaidMinor,
    allocations: s.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: a.amountMinor,
      whtMinor: a.whtMinor,
    })),
  };
}

/** WHT lines for one allocation: each WHT base pro-rated to the settled share of the invoice. */
export function whtLinesFor(
  inv: VendorInvoice,
  settlementMinor: bigint,
): WhtLineInput[] {
  const s = inv.snapshot();
  return inv.whtBases().map((b) => {
    const base = proratedBase(b.baseMinor, settlementMinor, s.totalMinor);
    return {
      taxCode: b.taxCode,
      incomeType: b.incomeType ?? b.taxCode,
      rateBp: b.rateBp,
      pndForm: b.pndForm ?? 'PND53',
      baseMinor: base,
      taxMinor: computeWhtMinor(base, b.rateBp),
    };
  });
}

export interface CreateVoucherInput {
  readonly companyId: string;
  readonly vendorId: string;
  readonly method: PaymentMethod;
  readonly paymentDate?: IsoDate | null;
  readonly currency?: string | null;
  readonly reference?: string | null;
  readonly chequeNumber?: string | null;
  readonly chequeBank?: string | null;
  readonly chequeDate?: IsoDate | null;
  readonly notes?: string | null;
  /** Invoice settlements (gross). Omit to pay every open invoice due on or before paymentDate. */
  readonly allocations?: ReadonlyArray<{
    readonly invoiceId: string;
    readonly amountMinor?: bigint | null;
  }> | null;
  readonly batchId?: string | null;
}

/** T-341: builds a voucher whose WHT is computed from the invoices' WHT-bearing lines. */
@Injectable()
export class CreatePaymentVoucherUseCase {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly invoices: VendorInvoiceRepository,
    @Inject(AP_REF_LOOKUP) private readonly refs: ApRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateVoucherInput): Promise<PaymentVoucher> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const paymentDate = input.paymentDate ?? toIsoDate(now);
    const [company, vendor] = await Promise.all([
      this.refs.findCompany(tenantId, input.companyId),
      this.refs.findVendor(tenantId, input.vendorId),
    ]);
    if (!company?.isActive)
      throw new ApRefInvalidError(
        `company ${input.companyId} does not exist or is inactive`,
      );
    if (!vendor?.isActive)
      throw new ApRefInvalidError(
        `vendor ${input.vendorId} does not exist or is inactive`,
      );
    return this.tx.runInTransaction(async () => {
      const picks =
        input.allocations ??
        (await this.invoices.listOpen(tenantId, vendor.id, paymentDate)).map(
          (i) => ({ invoiceId: i.id, amountMinor: null }),
        );
      const allocations: PaymentAllocationSnapshot[] = [];
      for (const p of picks) {
        const inv = await this.invoices.findById(tenantId, p.invoiceId);
        if (!inv) throw new VendorInvoiceNotFoundError(p.invoiceId);
        const s = inv.snapshot();
        if (s.vendorId !== vendor.id)
          throw new InvalidVoucherError(
            `invoice ${s.number} belongs to another vendor`,
          );
        const amount = p.amountMinor ?? s.balanceMinor;
        if (!inv.isOpen || amount <= 0n || amount > s.balanceMinor) {
          throw new InvalidVoucherError(
            `invoice ${s.number} cannot take ${amount.toString()} (open balance ${s.balanceMinor.toString()})`,
          );
        }
        const wht = whtLinesFor(inv, amount).reduce(
          (sum, l) => sum + l.taxMinor,
          0n,
        );
        allocations.push({
          id: randomUUID(),
          invoiceId: inv.id,
          amountMinor: amount,
          whtMinor: wht,
        });
      }
      const v = PaymentVoucher.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(tenantId, VOUCHER_NUMBER_PREFIX, now),
        vendorId: vendor.id,
        batchId: input.batchId ?? null,
        currency: input.currency ?? company.baseCurrency,
        paymentDate,
        method: input.method,
        reference: input.reference,
        chequeNumber: input.chequeNumber,
        chequeBank: input.chequeBank,
        chequeDate: input.chequeDate ?? null,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        allocations,
        now,
      });
      await this.vouchers.create(v);
      return v;
    });
  }
}

export interface VoucherActionInput {
  readonly voucherId: string;
  readonly expectedVersion?: number | null;
}

/** Shared by voucher and batch posting: settle invoices, issue the WHT certificate, emit the event. */
@Injectable()
export class VoucherPoster {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly invoices: VendorInvoiceRepository,
    @Inject(WHT_CERTIFICATE_REPOSITORY)
    private readonly certificates: WhtCertificateRepository,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(AP_POSTING_GATE) private readonly gate: ApPostingGate,
    @Inject(AP_OUTBOX) private readonly outbox: ApOutbox,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async post(v: PaymentVoucher, now: Date): Promise<PaymentVoucher> {
    const tenantId = this.tenant.getTenantId();
    const s = v.snapshot();
    await this.gate.assertOpen(s.companyId, s.paymentDate);
    const whtLines: WhtLineInput[] = [];
    let vendorName = '';
    let vendorTaxId: string | null = null;
    for (const a of s.allocations) {
      const inv = await this.invoices.findById(tenantId, a.invoiceId);
      if (!inv) throw new VendorInvoiceNotFoundError(a.invoiceId);
      vendorName = inv.snapshot().vendorName;
      vendorTaxId = inv.snapshot().vendorTaxId;
      whtLines.push(...whtLinesFor(inv, a.amountMinor));
      await this.invoices.save(inv.applySettlement(a.amountMinor, now));
    }
    const posted = await this.vouchers.save(v.post(now));
    if (s.whtMinor > 0n) {
      const built = buildCertificateLines(whtLines, randomUUID);
      const cert: WhtCertificateSnapshot = {
        id: randomUUID(),
        tenantId,
        companyId: s.companyId,
        voucherId: posted.id,
        number: await this.numbers.next(tenantId, WHT_CERT_NUMBER_PREFIX, now),
        pndForm: built.pndForm,
        vendorId: s.vendorId,
        vendorName,
        vendorTaxId,
        paymentDate: s.paymentDate,
        totalBaseMinor: built.totalBaseMinor,
        totalTaxMinor: built.totalTaxMinor,
        isVoid: false,
        lines: built.lines,
        createdAt: now,
      };
      await this.certificates.create(cert);
    }
    await this.outbox.enqueue({
      idempotencyKey: `${posted.id}:posted`,
      event: paymentEvent(
        posted,
        'payment_voucher.posted.v1',
        this.tenant.getUserId(),
        now,
      ),
    });
    return posted;
  }

  async void(v: PaymentVoucher, now: Date): Promise<PaymentVoucher> {
    const tenantId = this.tenant.getTenantId();
    const wasPosted = v.status === 'POSTED';
    if (wasPosted) {
      await this.gate.assertOpen(v.snapshot().companyId, toIsoDate(now));
      for (const a of v.snapshot().allocations) {
        const inv = await this.invoices.findById(tenantId, a.invoiceId);
        if (!inv) throw new VendorInvoiceNotFoundError(a.invoiceId);
        await this.invoices.save(inv.reverseSettlement(a.amountMinor, now));
      }
      const cert = await this.certificates.findByVoucher(tenantId, v.id);
      if (cert) await this.certificates.markVoid(tenantId, cert.id);
    }
    const voided = await this.vouchers.save(v.void(now));
    if (wasPosted)
      await this.outbox.enqueue({
        idempotencyKey: `${voided.id}:voided`,
        event: paymentEvent(
          voided,
          'payment_voucher.voided.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
    return voided;
  }
}

@Injectable()
export class PostPaymentVoucherUseCase {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    private readonly poster: VoucherPoster,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: VoucherActionInput): Promise<PaymentVoucher> {
    return this.tx.runInTransaction(async () => {
      const v = await this.vouchers.findById(
        this.tenant.getTenantId(),
        input.voucherId,
      );
      if (!v) throw new VoucherNotFoundError(input.voucherId);
      assertVersion(v.id, v.version, input.expectedVersion);
      if (v.snapshot().batchId)
        throw new InvalidVoucherError('this voucher is paid through its batch');
      return this.poster.post(v, this.clock.now());
    });
  }
}

@Injectable()
export class VoidPaymentVoucherUseCase {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    private readonly poster: VoucherPoster,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: VoucherActionInput): Promise<PaymentVoucher> {
    return this.tx.runInTransaction(async () => {
      const v = await this.vouchers.findById(
        this.tenant.getTenantId(),
        input.voucherId,
      );
      if (!v) throw new VoucherNotFoundError(input.voucherId);
      assertVersion(v.id, v.version, input.expectedVersion);
      return this.poster.void(v, this.clock.now());
    });
  }
}

@Injectable()
export class GetPaymentVoucherUseCase {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<PaymentVoucher> {
    const v = await this.vouchers.findById(this.tenant.getTenantId(), id);
    if (!v) throw new VoucherNotFoundError(id);
    return v;
  }
}

@Injectable()
export class ListPaymentVouchersUseCase {
  constructor(
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    input: Omit<VoucherFilter, 'limit' | 'offset'> & {
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.vouchers.list(this.tenant.getTenantId(), {
      ...input,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}

export interface CreateBatchInput {
  readonly companyId: string;
  readonly method: PaymentMethod;
  readonly paymentDate?: IsoDate | null;
  readonly currency?: string | null;
  /** Existing DRAFT vouchers to group; omit to build one voucher per vendor for everything due. */
  readonly voucherIds?: readonly string[] | null;
  readonly vendorIds?: readonly string[] | null;
}

/** T-344: group vouchers (or generate one per vendor from what is due) and pay them together. */
@Injectable()
export class CreatePaymentBatchUseCase {
  constructor(
    @Inject(PAYMENT_BATCH_REPOSITORY)
    private readonly batches: PaymentBatchRepository,
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly invoices: VendorInvoiceRepository,
    @Inject(AP_REF_LOOKUP) private readonly refs: ApRefLookup,
    private readonly createVoucher: CreatePaymentVoucherUseCase,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateBatchInput,
  ): Promise<{ batch: PaymentBatch; vouchers: readonly PaymentVoucher[] }> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const paymentDate = input.paymentDate ?? toIsoDate(now);
    const company = await this.refs.findCompany(tenantId, input.companyId);
    if (!company?.isActive)
      throw new ApRefInvalidError(
        `company ${input.companyId} does not exist or is inactive`,
      );
    const currency = (input.currency ?? company.baseCurrency).toUpperCase();
    return this.tx.runInTransaction(async () => {
      let vouchers: PaymentVoucher[];
      if (input.voucherIds?.length) {
        vouchers = [
          ...(await this.vouchers.findMany(tenantId, input.voucherIds)),
        ];
        if (vouchers.length !== input.voucherIds.length)
          throw new InvalidBatchError('some vouchers do not exist');
      } else {
        const due = await this.invoices.listOpen(tenantId, null, paymentDate);
        const vendorIds = [
          ...new Set(
            due
              .filter(
                (i) =>
                  i.snapshot().companyId === company.id &&
                  (!input.vendorIds?.length ||
                    input.vendorIds.includes(i.snapshot().vendorId)),
              )
              .map((i) => i.snapshot().vendorId),
          ),
        ];
        vouchers = [];
        for (const vendorId of vendorIds) {
          vouchers.push(
            await this.createVoucher.execute({
              companyId: company.id,
              vendorId,
              method: input.method,
              paymentDate,
              currency,
            }),
          );
        }
      }
      const batchId = randomUUID();
      const batch = PaymentBatch.create({
        id: batchId,
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(tenantId, BATCH_NUMBER_PREFIX, now),
        paymentDate,
        method: input.method,
        currency,
        createdBy: this.tenant.getUserId(),
        vouchers,
        now,
      });
      await this.batches.create(batch);
      const attached: PaymentVoucher[] = [];
      for (const v of vouchers)
        attached.push(await this.vouchers.save(v.attachToBatch(batchId, now)));
      return { batch, vouchers: attached };
    });
  }
}

export interface BatchActionInput {
  readonly batchId: string;
  readonly expectedVersion?: number | null;
}

@Injectable()
export class PostPaymentBatchUseCase {
  constructor(
    @Inject(PAYMENT_BATCH_REPOSITORY)
    private readonly batches: PaymentBatchRepository,
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    private readonly poster: VoucherPoster,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: BatchActionInput): Promise<PaymentBatch> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const b = await this.batches.findById(tenantId, input.batchId);
      if (!b) throw new BatchNotFoundError(input.batchId);
      assertVersion(b.id, b.version, input.expectedVersion);
      for (const v of await this.vouchers.listForBatch(tenantId, b.id)) {
        if (v.status === 'DRAFT') await this.poster.post(v, now);
      }
      return this.batches.save(b.post(now));
    });
  }
}

@Injectable()
export class VoidPaymentBatchUseCase {
  constructor(
    @Inject(PAYMENT_BATCH_REPOSITORY)
    private readonly batches: PaymentBatchRepository,
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    private readonly poster: VoucherPoster,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: BatchActionInput): Promise<PaymentBatch> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const b = await this.batches.findById(tenantId, input.batchId);
      if (!b) throw new BatchNotFoundError(input.batchId);
      assertVersion(b.id, b.version, input.expectedVersion);
      for (const v of await this.vouchers.listForBatch(tenantId, b.id)) {
        if (v.status === 'DRAFT') await this.poster.void(v, now);
      }
      return this.batches.save(b.void(now));
    });
  }
}

@Injectable()
export class GetPaymentBatchUseCase {
  constructor(
    @Inject(PAYMENT_BATCH_REPOSITORY)
    private readonly batches: PaymentBatchRepository,
    @Inject(PAYMENT_VOUCHER_REPOSITORY)
    private readonly vouchers: PaymentVoucherRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    id: string,
  ): Promise<{ batch: PaymentBatch; vouchers: readonly PaymentVoucher[] }> {
    const tenantId = this.tenant.getTenantId();
    const batch = await this.batches.findById(tenantId, id);
    if (!batch) throw new BatchNotFoundError(id);
    return { batch, vouchers: await this.vouchers.listForBatch(tenantId, id) };
  }
}

@Injectable()
export class GetWhtCertificateUseCase {
  constructor(
    @Inject(WHT_CERTIFICATE_REPOSITORY)
    private readonly certificates: WhtCertificateRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(id: string): Promise<WhtCertificateSnapshot> {
    const c = await this.certificates.findById(this.tenant.getTenantId(), id);
    if (!c) throw new CertificateNotFoundError(id);
    return c;
  }
}

@Injectable()
export class ListWhtCertificatesUseCase {
  constructor(
    @Inject(WHT_CERTIFICATE_REPOSITORY)
    private readonly certificates: WhtCertificateRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(input: {
    vendorId?: string | null;
    from?: IsoDate | null;
    to?: IsoDate | null;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.certificates.list(this.tenant.getTenantId(), {
      ...input,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}
