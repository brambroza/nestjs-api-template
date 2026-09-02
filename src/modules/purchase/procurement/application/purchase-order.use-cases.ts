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
  PurchaseOrder,
  PurchaseOrderNotFoundError,
  PurchaseRefInvalidError,
  PurchaseVersionConflictError,
  RequisitionNotConvertibleError,
  RequisitionNotFoundError,
  type PurchaseOrderEvent,
  type PurchaseOrderStatus,
} from '../domain';

import { PURCHASE_OUTBOX, type PurchaseOutbox } from './ports/outbox.port';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from './ports/purchase-order.repository';
import {
  PURCHASE_REF_LOOKUP,
  type PurchaseRefLookup,
} from './ports/purchase-ref-lookup.port';
import { PURCHASE_TAX, type PurchaseTax } from './ports/purchase-tax.port';
import {
  REQUISITION_REPOSITORY,
  type RequisitionRepository,
} from './ports/requisition.repository';
import {
  buildPurchaseOrderLines,
  type PurchaseLineRequest,
} from './purchase-lines';

export const PURCHASE_ORDER_NUMBER_PREFIX = 'PO';
export const PURCHASE_ORDER_DOCUMENT_TYPE = 'PURCHASE_ORDER';

function assertVersion(
  po: PurchaseOrder,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== po.version) {
    throw new PurchaseVersionConflictError(po.id, expected, po.version);
  }
}

export function orderEvent(
  po: PurchaseOrder,
  type: PurchaseOrderEvent['type'],
  actor: string,
  now: Date,
  reason: string | null = null,
): PurchaseOrderEvent {
  const s = po.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    number: s.number,
    amountMinor: s.totalMinor,
    currency: s.currency,
    actor,
    vendorId: s.vendorId,
    awaitingApproval: s.status === 'PENDING_APPROVAL',
    reason,
  };
}

export interface CreatePurchaseOrderInput {
  /** Convert an APPROVED requisition: company, currency and lines come from it (estimates as prices). */
  readonly requisitionId?: string | null;
  readonly companyId?: string | null;
  readonly vendorId: string;
  readonly currency?: string | null;
  readonly orderDate?: IsoDate | null;
  readonly expectedDate?: IsoDate | null;
  readonly paymentTermsDays?: number | null;
  readonly notes?: string | null;
  /** When converting, overrides the requisition's lines (re-priced by the buyer). */
  readonly lines?: readonly PurchaseLineRequest[] | null;
}

@Injectable()
export class CreatePurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(REQUISITION_REPOSITORY)
    private readonly requisitions: RequisitionRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(PURCHASE_TAX) private readonly tax: PurchaseTax,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const requisitionId = (input.requisitionId ?? '').trim() || null;
      const requisition = requisitionId
        ? await this.requisitions.findById(tenantId, requisitionId)
        : null;
      if (requisitionId) {
        if (!requisition) throw new RequisitionNotFoundError(requisitionId);
        if (!requisition.isConvertible) {
          throw new RequisitionNotConvertibleError(
            `requisition ${requisition.snapshot().number} is ${requisition.status}`,
          );
        }
      }
      const rs = requisition?.snapshot();
      const companyId = rs?.companyId ?? input.companyId ?? '';
      const [company, vendor] = await Promise.all([
        this.refs.findCompany(tenantId, companyId),
        this.refs.findVendor(tenantId, input.vendorId),
      ]);
      if (!company?.isActive) {
        throw new PurchaseRefInvalidError(
          `company ${companyId} does not exist or is inactive`,
        );
      }
      if (!vendor?.isActive) {
        throw new PurchaseRefInvalidError(
          `vendor ${input.vendorId} does not exist or is inactive`,
        );
      }
      const currency = (rs?.currency ?? input.currency ?? company.baseCurrency)
        .trim()
        .toUpperCase();
      if (!(await this.refs.currencyExists(tenantId, currency))) {
        throw new PurchaseRefInvalidError(
          `currency ${currency} is not configured`,
        );
      }
      const requests: readonly PurchaseLineRequest[] =
        input.lines ??
        (rs?.lines ?? []).map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          unitPriceMinor: l.estimatedUnitPriceMinor,
          uomCode: l.uomCode,
          description: l.description,
        }));
      const lines = await buildPurchaseOrderLines(requests, tenantId, {
        refs: this.refs,
        tax: this.tax,
        newId: randomUUID,
      });
      const po = PurchaseOrder.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(
          tenantId,
          PURCHASE_ORDER_NUMBER_PREFIX,
          now,
        ),
        requisitionId: rs?.id ?? null,
        vendorId: vendor.id,
        currency,
        orderDate: input.orderDate ?? toIsoDate(now),
        expectedDate: input.expectedDate ?? rs?.neededByDate ?? null,
        paymentTermsDays: input.paymentTermsDays ?? vendor.paymentTermsDays,
        notes: input.notes ?? rs?.purpose ?? null,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.repo.create(po);
      if (requisition)
        await this.requisitions.save(requisition.markConverted(po.id, now));
      return po;
    });
  }
}

export interface UpdatePurchaseOrderInput {
  readonly purchaseOrderId: string;
  readonly expectedVersion?: number | null;
  readonly expectedDate?: IsoDate | null;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
  readonly lines?: readonly PurchaseLineRequest[] | null;
}

@Injectable()
export class UpdatePurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(PURCHASE_TAX) private readonly tax: PurchaseTax,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdatePurchaseOrderInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.purchaseOrderId);
      if (!current) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      assertVersion(current, input.expectedVersion);
      let next = current.updateHeader(
        {
          expectedDate: input.expectedDate,
          paymentTermsDays: input.paymentTermsDays,
          notes: input.notes,
        },
        now,
      );
      if (input.lines) {
        const lines = await buildPurchaseOrderLines(input.lines, tenantId, {
          refs: this.refs,
          tax: this.tax,
          newId: randomUUID,
        });
        next = next.replaceLines(lines, now);
      }
      return this.repo.save(next);
    });
  }
}

export interface PurchaseOrderActionInput {
  readonly purchaseOrderId: string;
  readonly expectedVersion?: number | null;
  readonly reason?: string | null;
}

/** T-222: approval matrix on the PO total; ISSUED at once when no step applies. */
@Injectable()
export class SubmitPurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PurchaseOrderActionInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.purchaseOrderId);
      if (!current) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      assertVersion(current, input.expectedVersion);
      const s = current.snapshot();
      const outcome = await this.approvals.submit({
        documentType: PURCHASE_ORDER_DOCUMENT_TYPE,
        documentId: s.id,
        amountMinor: s.totalMinor,
        currency: s.currency,
      });
      const saved = await this.repo.save(
        current.submit(
          {
            approvalRequestId: outcome.requestId,
            approval: outcome.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
          },
          now,
        ),
      );
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:submitted:${outcome.requestId}`,
        event: orderEvent(saved, 'purchase_order.submitted.v1', userId, now),
      });
      if (saved.status === 'ISSUED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:issued:${outcome.requestId}`,
          event: orderEvent(saved, 'purchase_order.issued.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

@Injectable()
export class ConfirmPurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PurchaseOrderActionInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.purchaseOrderId);
      if (!current) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      assertVersion(current, input.expectedVersion);
      const state = await this.approvals.stateOf(
        PURCHASE_ORDER_DOCUMENT_TYPE,
        current.id,
      );
      const saved = await this.repo.save(
        current.applyApprovalOutcome(state.status, now),
      );
      const key = state.requestId ?? 'none';
      if (saved.status === 'ISSUED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:issued:${key}`,
          event: orderEvent(saved, 'purchase_order.issued.v1', userId, now),
        });
      } else if (saved.status === 'REJECTED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:rejected:${key}`,
          event: orderEvent(saved, 'purchase_order.rejected.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

@Injectable()
export class ReopenPurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PurchaseOrderActionInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.purchaseOrderId);
      if (!current) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      assertVersion(current, input.expectedVersion);
      return this.repo.save(current.reopen(this.clock.now()));
    });
  }
}

@Injectable()
export class CancelPurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PurchaseOrderActionInput): Promise<PurchaseOrder> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.purchaseOrderId);
      if (!current) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      assertVersion(current, input.expectedVersion);
      const saved = await this.repo.save(
        current.cancel(input.reason ?? null, now),
      );
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:cancelled`,
        event: orderEvent(
          saved,
          'purchase_order.cancelled.v1',
          this.tenant.getUserId(),
          now,
          saved.snapshot().cancelReason,
        ),
      });
      return saved;
    });
  }
}

@Injectable()
export class GetPurchaseOrderUseCase {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!po) throw new PurchaseOrderNotFoundError(id);
    return po;
  }
}

export interface ListPurchaseOrdersInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: PurchaseOrderStatus | null;
  readonly vendorId?: string | null;
}

export interface ListPurchaseOrdersResult {
  readonly items: readonly PurchaseOrder[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListPurchaseOrdersUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly repo: PurchaseOrderRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListPurchaseOrdersInput = {},
  ): Promise<ListPurchaseOrdersResult> {
    const limit = Math.max(
      1,
      Math.min(
        ListPurchaseOrdersUseCase.MAX_LIMIT,
        Math.trunc(input.limit ?? ListPurchaseOrdersUseCase.DEFAULT_LIMIT),
      ),
    );
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      status: input.status ?? null,
      vendorId: input.vendorId ?? null,
    });
    return { items, total, limit, offset };
  }
}
