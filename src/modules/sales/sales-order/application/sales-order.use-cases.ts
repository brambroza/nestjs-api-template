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
  QUOTATION_CONVERSION,
  QuotationStatus,
  type QuotationConversion,
} from '../../quotation';
import {
  DOCUMENT_PRICING,
  SALES_REF_LOOKUP,
  SalesRefInvalidError,
  priceLines,
  type CustomerRef,
  type DocumentPricing,
  type LineRequest,
  type SalesRefLookup,
} from '../../shared';
import {
  CreditStatus,
  QuotationNotConvertibleError,
  SalesOrder,
  SalesOrderNotFoundError,
  SalesOrderVersionConflictError,
  type CreditCheck,
  type SalesOrderEvent,
  type SalesOrderStatus,
} from '../domain';

import { SALES_ORDER_OUTBOX, type SalesOrderOutbox } from './ports/outbox.port';
import {
  SALES_ORDER_REPOSITORY,
  type SalesOrderRepository,
} from './ports/sales-order.repository';

export const SALES_ORDER_NUMBER_PREFIX = 'SO';
export const SALES_ORDER_DOCUMENT_TYPE = 'SALES_ORDER';
/** Credit limits are kept in THB (md_customer.creditLimitSatang). */
export const CREDIT_CURRENCY = 'THB';

export function resolvedEvent(
  so: SalesOrder,
  type: Extract<SalesOrderEvent, { reason: string | null }>['type'],
  actor: string,
  now: Date,
  reason: string | null = null,
): SalesOrderEvent {
  const s = so.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    number: s.number,
    customerId: s.customerId,
    totalMinor: s.totalMinor,
    currency: s.currency,
    actor,
    reason,
  };
}

function assertExpectedVersion(
  so: SalesOrder,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== so.version) {
    throw new SalesOrderVersionConflictError(so.id, expected, so.version);
  }
}

export interface CreateSalesOrderInput {
  /** Convert an ACCEPTED quotation: header + lines are copied at the quoted prices. */
  readonly quotationId?: string | null;
  readonly companyId?: string | null;
  readonly customerId?: string | null;
  readonly currency?: string | null;
  readonly orderDate?: IsoDate | null;
  readonly requestedDeliveryDate?: IsoDate | null;
  readonly paymentTermsDays?: number | null;
  readonly notes?: string | null;
  /** Ignored when converting a quotation. */
  readonly lines?: readonly LineRequest[] | null;
}

@Injectable()
export class CreateSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(DOCUMENT_PRICING) private readonly pricing: DocumentPricing,
    @Inject(QUOTATION_CONVERSION)
    private readonly quotations: QuotationConversion,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateSalesOrderInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const quotationId = (input.quotationId ?? '').trim() || null;
    const quotation = quotationId
      ? await this.quotations.findForConversion(quotationId)
      : null;
    if (quotationId) {
      if (!quotation)
        throw new QuotationNotConvertibleError(
          `quotation ${quotationId} not found`,
        );
      if (quotation.status !== QuotationStatus.Accepted) {
        throw new QuotationNotConvertibleError(
          `quotation ${quotation.number} rev ${String(quotation.revision)} is ${quotation.status}, not ACCEPTED`,
        );
      }
      if (quotation.salesOrderId) {
        throw new QuotationNotConvertibleError(
          `quotation ${quotation.number} was already converted to ${quotation.salesOrderId}`,
        );
      }
    }
    const companyId = quotation?.companyId ?? input.companyId ?? '';
    const customerId = quotation?.customerId ?? input.customerId ?? '';
    const [company, customer] = await Promise.all([
      this.refs.findCompany(tenantId, companyId),
      this.refs.findCustomer(tenantId, customerId),
    ]);
    if (!company?.isActive) {
      throw new SalesRefInvalidError(
        `company ${companyId} does not exist or is inactive`,
      );
    }
    if (!customer?.isActive) {
      throw new SalesRefInvalidError(
        `customer ${customerId} does not exist or is inactive`,
      );
    }
    const currency = (
      quotation?.currency ??
      input.currency ??
      company.baseCurrency
    )
      .trim()
      .toUpperCase();
    if (!(await this.refs.currencyExists(tenantId, currency))) {
      throw new SalesRefInvalidError(`currency ${currency} is not configured`);
    }
    const lines = quotation
      ? quotation.lines.map((l) => ({ ...l, id: randomUUID() }))
      : await priceLines(
          input.lines ?? [],
          { tenantId, customerId: customer.id, currency, date: now },
          { refs: this.refs, pricing: this.pricing, newId: randomUUID },
        );
    return this.tx.runInTransaction(async () => {
      const number = await this.numbers.next(
        tenantId,
        SALES_ORDER_NUMBER_PREFIX,
        now,
      );
      const so = SalesOrder.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number,
        quotationId: quotation?.id ?? null,
        customerId: customer.id,
        currency,
        orderDate: input.orderDate ?? toIsoDate(now),
        requestedDeliveryDate: input.requestedDeliveryDate ?? null,
        paymentTermsDays:
          input.paymentTermsDays ??
          quotation?.paymentTermsDays ??
          customer.paymentTermsDays,
        notes: input.notes ?? quotation?.notes ?? null,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(so);
      if (quotation) await this.quotations.markConverted(quotation.id, so.id);
      return so;
    });
  }
}

export interface UpdateSalesOrderInput {
  readonly salesOrderId: string;
  readonly expectedVersion?: number | null;
  readonly requestedDeliveryDate?: IsoDate | null;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
  readonly lines?: readonly LineRequest[] | null;
}

@Injectable()
export class UpdateSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(DOCUMENT_PRICING) private readonly pricing: DocumentPricing,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateSalesOrderInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.salesOrderId);
      if (!current) throw new SalesOrderNotFoundError(input.salesOrderId);
      assertExpectedVersion(current, input.expectedVersion);
      let next = current.updateHeader(
        {
          requestedDeliveryDate: input.requestedDeliveryDate,
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

export interface OrderActionInput {
  readonly salesOrderId: string;
  readonly expectedVersion?: number | null;
  readonly reason?: string | null;
}

/** Pure decision, exported for tests. */
export function evaluateCredit(
  customer: CustomerRef,
  currency: string,
  openExposureMinor: bigint,
  orderTotalMinor: bigint,
): CreditCheck {
  const exposureMinor = openExposureMinor + orderTotalMinor;
  if (currency !== CREDIT_CURRENCY) {
    return { status: CreditStatus.NotChecked, exposureMinor };
  }
  if (customer.creditLimitMinor <= 0n) {
    return { status: CreditStatus.NoLimit, exposureMinor };
  }
  return {
    status:
      exposureMinor > customer.creditLimitMinor
        ? CreditStatus.Exceeded
        : CreditStatus.Ok,
    exposureMinor,
  };
}

/**
 * T-211/T-212: credit check, then the approval framework. The approval
 * request row is written inside this transaction; a credit breach that
 * would otherwise auto-approve rolls everything back (409).
 */
@Injectable()
export class SubmitSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(SALES_ORDER_OUTBOX) private readonly outbox: SalesOrderOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: OrderActionInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.salesOrderId);
      if (!current) throw new SalesOrderNotFoundError(input.salesOrderId);
      assertExpectedVersion(current, input.expectedVersion);
      const s = current.snapshot();
      const customer = await this.refs.findCustomer(tenantId, s.customerId);
      if (!customer?.isActive) {
        throw new SalesRefInvalidError(
          `customer ${s.customerId} does not exist or is inactive`,
        );
      }
      const open = await this.repo.sumOpenExposure(
        tenantId,
        s.customerId,
        s.currency,
        s.id,
      );
      const credit = evaluateCredit(customer, s.currency, open, s.totalMinor);
      const outcome = await this.approvals.submit({
        documentType: SALES_ORDER_DOCUMENT_TYPE,
        documentId: s.id,
        amountMinor: s.totalMinor,
        currency: s.currency,
      });
      const next = current.submit({
        credit,
        outcome: {
          approvalRequestId: outcome.requestId,
          approval: outcome.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
        },
        creditLimitMinor: customer.creditLimitMinor,
        now,
      });
      const saved = await this.repo.save(next);
      const ns = saved.snapshot();
      await this.outbox.enqueue({
        idempotencyKey: `${ns.id}:submitted:${outcome.requestId}`,
        event: {
          type: 'sales_order.submitted.v1',
          aggregateId: ns.id,
          tenantId: ns.tenantId,
          occurredAt: now,
          number: ns.number,
          customerId: ns.customerId,
          totalMinor: ns.totalMinor,
          currency: ns.currency,
          actor: userId,
          approvalRequestId: outcome.requestId,
          awaitingApproval: ns.status === 'PENDING_APPROVAL',
          creditStatus: ns.creditStatus,
        },
      });
      if (ns.status === 'CONFIRMED') {
        await this.outbox.enqueue({
          idempotencyKey: `${ns.id}:confirmed:${outcome.requestId}`,
          event: resolvedEvent(saved, 'sales_order.confirmed.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

/** Pulls the approval outcome for a PENDING_APPROVAL order and applies it. */
@Injectable()
export class ConfirmSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(SALES_ORDER_OUTBOX) private readonly outbox: SalesOrderOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: OrderActionInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.salesOrderId);
      if (!current) throw new SalesOrderNotFoundError(input.salesOrderId);
      assertExpectedVersion(current, input.expectedVersion);
      const state = await this.approvals.stateOf(
        SALES_ORDER_DOCUMENT_TYPE,
        current.id,
      );
      const next = current.applyApprovalOutcome(state.status, now);
      const saved = await this.repo.save(next);
      const key = state.requestId ?? 'none';
      if (saved.status === 'CONFIRMED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:confirmed:${key}`,
          event: resolvedEvent(saved, 'sales_order.confirmed.v1', userId, now),
        });
      } else if (saved.status === 'REJECTED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:rejected:${key}`,
          event: resolvedEvent(saved, 'sales_order.rejected.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

@Injectable()
export class ReopenSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: OrderActionInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.salesOrderId);
      if (!current) throw new SalesOrderNotFoundError(input.salesOrderId);
      assertExpectedVersion(current, input.expectedVersion);
      return this.repo.save(current.reopen(this.clock.now()));
    });
  }
}

@Injectable()
export class CancelSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(SALES_ORDER_OUTBOX) private readonly outbox: SalesOrderOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: OrderActionInput): Promise<SalesOrder> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.salesOrderId);
      if (!current) throw new SalesOrderNotFoundError(input.salesOrderId);
      assertExpectedVersion(current, input.expectedVersion);
      const saved = await this.repo.save(
        current.cancel(input.reason ?? null, now),
      );
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:cancelled`,
        event: resolvedEvent(
          saved,
          'sales_order.cancelled.v1',
          userId,
          now,
          saved.snapshot().cancelReason,
        ),
      });
      return saved;
    });
  }
}

@Injectable()
export class GetSalesOrderUseCase {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<SalesOrder> {
    const so = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!so) throw new SalesOrderNotFoundError(id);
    return so;
  }
}

export interface ListSalesOrdersInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: SalesOrderStatus | null;
  readonly customerId?: string | null;
}

export interface ListSalesOrdersResult {
  readonly items: readonly SalesOrder[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListSalesOrdersUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly repo: SalesOrderRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListSalesOrdersInput = {},
  ): Promise<ListSalesOrdersResult> {
    const limit = Math.max(
      1,
      Math.min(
        ListSalesOrdersUseCase.MAX_LIMIT,
        Math.trunc(input.limit ?? ListSalesOrdersUseCase.DEFAULT_LIMIT),
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
