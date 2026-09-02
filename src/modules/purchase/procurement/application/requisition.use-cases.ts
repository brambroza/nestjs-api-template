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
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import { APPROVAL_GATEWAY, type ApprovalGateway } from '../../../approval';
import {
  PurchaseRefInvalidError,
  PurchaseRequisition,
  PurchaseVersionConflictError,
  RequisitionNotFoundError,
  type RequisitionEvent,
  type RequisitionStatus,
} from '../domain';

import { PURCHASE_OUTBOX, type PurchaseOutbox } from './ports/outbox.port';
import {
  PURCHASE_REF_LOOKUP,
  type PurchaseRefLookup,
} from './ports/purchase-ref-lookup.port';
import {
  REQUISITION_REPOSITORY,
  type RequisitionRepository,
} from './ports/requisition.repository';
import {
  buildRequisitionLines,
  type RequisitionLineRequest,
} from './purchase-lines';

export const REQUISITION_NUMBER_PREFIX = 'PR';
export const REQUISITION_DOCUMENT_TYPE = 'PURCHASE_REQUISITION';

function assertVersion(
  pr: PurchaseRequisition,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== pr.version) {
    throw new PurchaseVersionConflictError(pr.id, expected, pr.version);
  }
}

function event(
  pr: PurchaseRequisition,
  type: RequisitionEvent['type'],
  actor: string,
  now: Date,
): RequisitionEvent {
  const s = pr.snapshot();
  return {
    type,
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    number: s.number,
    amountMinor: s.estimatedTotalMinor,
    currency: s.currency,
    actor,
    requesterId: s.requesterId,
    awaitingApproval: s.status === 'PENDING_APPROVAL',
  };
}

export interface CreateRequisitionInput {
  readonly companyId: string;
  readonly currency?: string | null;
  readonly neededByDate?: IsoDate | null;
  readonly purpose?: string | null;
  readonly lines: readonly RequisitionLineRequest[];
}

@Injectable()
export class CreateRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateRequisitionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const company = await this.refs.findCompany(tenantId, input.companyId);
    if (!company?.isActive) {
      throw new PurchaseRefInvalidError(
        `company ${input.companyId} does not exist or is inactive`,
      );
    }
    const currency = (input.currency ?? company.baseCurrency)
      .trim()
      .toUpperCase();
    if (!(await this.refs.currencyExists(tenantId, currency))) {
      throw new PurchaseRefInvalidError(
        `currency ${currency} is not configured`,
      );
    }
    const lines = await buildRequisitionLines(input.lines, tenantId, {
      refs: this.refs,
      newId: randomUUID,
    });
    return this.tx.runInTransaction(async () => {
      const pr = PurchaseRequisition.create({
        id: randomUUID(),
        tenantId,
        companyId: company.id,
        number: await this.numbers.next(
          tenantId,
          REQUISITION_NUMBER_PREFIX,
          now,
        ),
        requesterId: this.tenant.getUserId(),
        neededByDate: input.neededByDate ?? null,
        purpose: input.purpose,
        currency,
        lines,
        now,
      });
      await this.repo.create(pr);
      return pr;
    });
  }
}

export interface UpdateRequisitionInput {
  readonly requisitionId: string;
  readonly expectedVersion?: number | null;
  readonly neededByDate?: IsoDate | null;
  readonly purpose?: string | null;
  readonly lines?: readonly RequisitionLineRequest[] | null;
}

@Injectable()
export class UpdateRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateRequisitionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.requisitionId);
      if (!current) throw new RequisitionNotFoundError(input.requisitionId);
      assertVersion(current, input.expectedVersion);
      let next = current.updateHeader(
        { neededByDate: input.neededByDate, purpose: input.purpose },
        now,
      );
      if (input.lines) {
        const lines = await buildRequisitionLines(input.lines, tenantId, {
          refs: this.refs,
          newId: randomUUID,
        });
        next = next.replaceLines(lines, now);
      }
      return this.repo.save(next);
    });
  }
}

export interface RequisitionActionInput {
  readonly requisitionId: string;
  readonly expectedVersion?: number | null;
}

@Injectable()
export class SubmitRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RequisitionActionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.requisitionId);
      if (!current) throw new RequisitionNotFoundError(input.requisitionId);
      assertVersion(current, input.expectedVersion);
      const s = current.snapshot();
      const outcome = await this.approvals.submit({
        documentType: REQUISITION_DOCUMENT_TYPE,
        documentId: s.id,
        amountMinor: s.estimatedTotalMinor,
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
        event: event(saved, 'purchase_requisition.submitted.v1', userId, now),
      });
      if (saved.status === 'APPROVED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:approved:${outcome.requestId}`,
          event: event(saved, 'purchase_requisition.approved.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

/** Pulls the approval outcome for a PENDING_APPROVAL requisition and applies it. */
@Injectable()
export class ConfirmRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(APPROVAL_GATEWAY) private readonly approvals: ApprovalGateway,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RequisitionActionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.requisitionId);
      if (!current) throw new RequisitionNotFoundError(input.requisitionId);
      assertVersion(current, input.expectedVersion);
      const state = await this.approvals.stateOf(
        REQUISITION_DOCUMENT_TYPE,
        current.id,
      );
      const saved = await this.repo.save(
        current.applyApprovalOutcome(state.status, now),
      );
      const key = state.requestId ?? 'none';
      if (saved.status === 'APPROVED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:approved:${key}`,
          event: event(saved, 'purchase_requisition.approved.v1', userId, now),
        });
      } else if (saved.status === 'REJECTED') {
        await this.outbox.enqueue({
          idempotencyKey: `${saved.id}:rejected:${key}`,
          event: event(saved, 'purchase_requisition.rejected.v1', userId, now),
        });
      }
      return saved;
    });
  }
}

@Injectable()
export class ReopenRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RequisitionActionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.requisitionId);
      if (!current) throw new RequisitionNotFoundError(input.requisitionId);
      assertVersion(current, input.expectedVersion);
      return this.repo.save(current.reopen(this.clock.now()));
    });
  }
}

@Injectable()
export class CancelRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RequisitionActionInput): Promise<PurchaseRequisition> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const current = await this.repo.findById(tenantId, input.requisitionId);
      if (!current) throw new RequisitionNotFoundError(input.requisitionId);
      assertVersion(current, input.expectedVersion);
      const saved = await this.repo.save(current.cancel(now));
      await this.outbox.enqueue({
        idempotencyKey: `${saved.id}:cancelled`,
        event: event(
          saved,
          'purchase_requisition.cancelled.v1',
          this.tenant.getUserId(),
          now,
        ),
      });
      return saved;
    });
  }
}

@Injectable()
export class GetRequisitionUseCase {
  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<PurchaseRequisition> {
    const pr = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!pr) throw new RequisitionNotFoundError(id);
    return pr;
  }
}

export interface ListRequisitionsInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: RequisitionStatus | null;
  readonly mine?: boolean;
}

export interface ListRequisitionsResult {
  readonly items: readonly PurchaseRequisition[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListRequisitionsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(REQUISITION_REPOSITORY)
    private readonly repo: RequisitionRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListRequisitionsInput = {},
  ): Promise<ListRequisitionsResult> {
    const limit = Math.max(
      1,
      Math.min(
        ListRequisitionsUseCase.MAX_LIMIT,
        Math.trunc(input.limit ?? ListRequisitionsUseCase.DEFAULT_LIMIT),
      ),
    );
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      status: input.status ?? null,
      requesterId: input.mine ? this.tenant.getUserId() : null,
    });
    return { items, total, limit, offset };
  }
}
