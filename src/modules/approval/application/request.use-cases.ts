import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../shared/transaction';
import {
  ApprovalRequest,
  ApprovalRequestNotFoundError,
  ApprovalStatus,
  PendingApprovalExistsError,
  type ApprovalEvent,
  type Decision,
} from '../domain';

import { allRolesOf, buildDecider } from './effective-roles';
import {
  APPROVAL_POLICY_REPOSITORY,
  type ApprovalPolicyRepository,
} from './ports/approval-policy.repository';
import {
  APPROVAL_REQUEST_REPOSITORY,
  type ApprovalRequestRepository,
} from './ports/approval-request.repository';
import {
  DELEGATION_REPOSITORY,
  type DelegationRepository,
} from './ports/delegation.repository';
import { APPROVAL_OUTBOX, type ApprovalOutbox } from './ports/outbox.port';
import {
  USER_ROLES_LOOKUP,
  type UserRolesLookup,
} from './ports/user-roles-lookup.port';

const today = (d: Date): string => d.toISOString().slice(0, 10);

function baseEvent(r: ApprovalRequest, now: Date) {
  const s = r.snapshot();
  return {
    aggregateId: s.id,
    tenantId: s.tenantId,
    occurredAt: now,
    documentType: s.documentType,
    documentId: s.documentId,
    amountMinor: s.amountMinor,
    currency: s.currency,
  };
}

export interface SubmitForApprovalInput {
  readonly documentType: string;
  readonly documentId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  /** Defaults to the current user. */
  readonly requestedBy?: string | null;
}

/**
 * Opens a request against the active policy for the document type.
 * No active policy, or no step reaching the amount = APPROVED at once
 * (no approval needed). Designed to be called from inside a document
 * use case's transaction — it participates via CLS (ADR 0002).
 */
@Injectable()
export class SubmitForApprovalUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(APPROVAL_POLICY_REPOSITORY)
    private readonly policies: ApprovalPolicyRepository,
    @Inject(APPROVAL_OUTBOX) private readonly outbox: ApprovalOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SubmitForApprovalInput): Promise<ApprovalRequest> {
    const tenantId = this.tenant.getTenantId();
    const documentType = input.documentType.trim().toUpperCase();
    return this.tx.runInTransaction(async () => {
      const pending = await this.requests.findPendingForDocument(
        tenantId,
        documentType,
        input.documentId,
      );
      if (pending) {
        throw new PendingApprovalExistsError(
          documentType,
          input.documentId,
          pending.snapshot().id,
        );
      }
      const policy = await this.policies.findActive(tenantId, documentType);
      const steps = policy ? policy.applicableSteps(input.amountMinor) : [];
      const now = this.clock.now();
      const request = ApprovalRequest.create({
        id: randomUUID(),
        tenantId,
        documentType,
        documentId: input.documentId,
        policyId: policy?.snapshot().id ?? null,
        amountMinor: input.amountMinor,
        currency: input.currency,
        requestedBy: input.requestedBy ?? this.tenant.getUserId(),
        steps: steps.map((st) => ({ ...st, requestStepId: randomUUID() })),
        now,
      });
      await this.requests.create(request);
      const first = request.currentStep();
      if (first) {
        const event: ApprovalEvent = {
          type: 'approval.requested.v1',
          ...baseEvent(request, now),
          requestedBy: request.snapshot().requestedBy,
          stepNo: first.stepNo,
          approverRole: first.approverRole,
        };
        await this.outbox.enqueue({
          idempotencyKey: `${request.snapshot().id}:requested`,
          event,
        });
      }
      return request;
    });
  }
}

export interface DecideApprovalInput {
  readonly requestId: string;
  readonly decision: Decision;
  readonly comment?: string | null;
}

@Injectable()
export class DecideApprovalUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(DELEGATION_REPOSITORY)
    private readonly delegations: DelegationRepository,
    @Inject(USER_ROLES_LOOKUP) private readonly roles: UserRolesLookup,
    @Inject(APPROVAL_OUTBOX) private readonly outbox: ApprovalOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DecideApprovalInput): Promise<ApprovalRequest> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    const decider = await buildDecider(
      tenantId,
      userId,
      today(now),
      this.roles,
      this.delegations,
    );
    return this.tx.runInTransaction(async () => {
      const request = await this.requests.findById(tenantId, input.requestId);
      if (!request) throw new ApprovalRequestNotFoundError(input.requestId);
      const before = request.snapshot().currentStepNo;
      const next = request.decide({
        decider,
        decision: input.decision,
        comment: input.comment ?? null,
        decisionId: randomUUID(),
        now,
      });
      await this.requests.save(next);

      const s = next.snapshot();
      const decisionNo = s.steps.reduce((n, st) => n + st.decisions.length, 0);
      if (
        s.status === ApprovalStatus.Approved ||
        s.status === ApprovalStatus.Rejected
      ) {
        await this.outbox.enqueue({
          idempotencyKey: `${s.id}:resolved`,
          event: {
            type:
              s.status === ApprovalStatus.Approved
                ? 'approval.approved.v1'
                : 'approval.rejected.v1',
            ...baseEvent(next, now),
            actor: userId,
            requestedBy: s.requestedBy,
          },
        });
      } else if (s.currentStepNo !== before) {
        const step = next.currentStep();
        if (step) {
          await this.outbox.enqueue({
            idempotencyKey: `${s.id}:step:${String(step.stepNo)}:${String(decisionNo)}`,
            event: {
              type: 'approval.step_advanced.v1',
              ...baseEvent(next, now),
              stepNo: step.stepNo,
              approverRole: step.approverRole,
            },
          });
        }
      }
      return next;
    });
  }
}

@Injectable()
export class CancelApprovalUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(APPROVAL_OUTBOX) private readonly outbox: ApprovalOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(requestId: string): Promise<ApprovalRequest> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    return this.tx.runInTransaction(async () => {
      const request = await this.requests.findById(tenantId, requestId);
      if (!request) throw new ApprovalRequestNotFoundError(requestId);
      const now = this.clock.now();
      const next = request.cancel(userId, now);
      await this.requests.save(next);
      await this.outbox.enqueue({
        idempotencyKey: `${requestId}:cancelled`,
        event: {
          type: 'approval.cancelled.v1',
          ...baseEvent(next, now),
          actor: userId,
          requestedBy: next.snapshot().requestedBy,
        },
      });
      return next;
    });
  }
}

@Injectable()
export class GetApprovalRequestUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<ApprovalRequest> {
    const found = await this.requests.findById(this.tenant.getTenantId(), id);
    if (!found) throw new ApprovalRequestNotFoundError(id);
    return found;
  }
}

@Injectable()
export class ListDocumentApprovalsUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    documentType: string,
    documentId: string,
  ): Promise<readonly ApprovalRequest[]> {
    return this.requests.listForDocument(
      this.tenant.getTenantId(),
      documentType.toUpperCase(),
      documentId,
    );
  }
}

/** "My inbox": pending requests I may decide right now (own or delegated roles, never my own). */
@Injectable()
export class ListMyPendingApprovalsUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(DELEGATION_REPOSITORY)
    private readonly delegations: DelegationRepository,
    @Inject(USER_ROLES_LOOKUP) private readonly roles: UserRolesLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly ApprovalRequest[]> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const decider = await buildDecider(
      tenantId,
      userId,
      today(this.clock.now()),
      this.roles,
      this.delegations,
    );
    const roles = allRolesOf(decider);
    if (roles.length === 0) return [];
    const candidates = await this.requests.listPendingForRoles(tenantId, roles);
    return candidates.filter((r) => {
      const s = r.snapshot();
      if (s.requestedBy === userId) return false;
      const { eligible, onBehalfOf } = r.eligibilityOf(decider);
      if (!eligible || onBehalfOf === s.requestedBy) return false;
      const step = r.currentStep();
      return !step?.decisions.some(
        (d) => d.decidedBy === userId || d.onBehalfOf === userId,
      );
    });
  }
}
