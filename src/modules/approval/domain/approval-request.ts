import { DomainError } from '../../../shared/errors';

import type { ApprovalPolicyStepSnapshot } from './approval-policy';

export const ApprovalStatus = {
  Pending: 'PENDING',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
  Cancelled: 'CANCELLED',
} as const;
export type ApprovalStatus =
  (typeof ApprovalStatus)[keyof typeof ApprovalStatus];
export function isApprovalStatus(v: string): v is ApprovalStatus {
  return (Object.values(ApprovalStatus) as readonly string[]).includes(v);
}

export const StepStatus = {
  Pending: 'PENDING',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
} as const;
export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];
export function isStepStatus(v: string): v is StepStatus {
  return (Object.values(StepStatus) as readonly string[]).includes(v);
}

export const Decision = { Approve: 'APPROVE', Reject: 'REJECT' } as const;
export type Decision = (typeof Decision)[keyof typeof Decision];
export function isDecision(v: string): v is Decision {
  return v === Decision.Approve || v === Decision.Reject;
}

export class ApprovalRequestNotFoundError extends DomainError {
  readonly code = 'APPROVAL.REQUEST_NOT_FOUND';
  constructor(readonly requestId: string) {
    super(`Approval request ${requestId} not found`);
  }
}
export class ApprovalNotPendingError extends DomainError {
  readonly code = 'APPROVAL.NOT_PENDING';
  constructor(
    readonly requestId: string,
    readonly status: ApprovalStatus,
  ) {
    super(`Approval request ${requestId} is ${status}, not PENDING`);
  }
}
export class PendingApprovalExistsError extends DomainError {
  readonly code = 'APPROVAL.PENDING_EXISTS';
  constructor(
    readonly documentType: string,
    readonly documentId: string,
    readonly requestId: string,
  ) {
    super(
      `${documentType} ${documentId} already has a pending approval (${requestId})`,
    );
  }
}
export class NotAnEligibleApproverError extends DomainError {
  readonly code = 'APPROVAL.NOT_ELIGIBLE';
  constructor(
    readonly requestId: string,
    readonly stepNo: number,
    readonly requiredRole: string,
  ) {
    super(
      `Step ${String(stepNo)} of ${requestId} requires role "${requiredRole}"`,
    );
  }
}
export class SelfApprovalError extends DomainError {
  readonly code = 'APPROVAL.SELF_APPROVAL';
  constructor(readonly requestId: string) {
    super(
      `The requester of ${requestId} cannot approve their own document (segregation of duties)`,
    );
  }
}
export class AlreadyDecidedError extends DomainError {
  readonly code = 'APPROVAL.ALREADY_DECIDED';
  constructor(
    readonly requestId: string,
    readonly stepNo: number,
  ) {
    super(`You have already decided step ${String(stepNo)} of ${requestId}`);
  }
}
export class NotTheRequesterError extends DomainError {
  readonly code = 'APPROVAL.NOT_THE_REQUESTER';
  constructor(readonly requestId: string) {
    super(`Only the requester may cancel ${requestId}`);
  }
}
export class InvalidApprovalRequestError extends DomainError {
  readonly code = 'APPROVAL.INVALID_REQUEST';
}

export interface DecisionSnapshot {
  readonly id: string;
  readonly decidedBy: string;
  readonly onBehalfOf: string | null;
  readonly decision: Decision;
  readonly comment: string | null;
  readonly decidedAt: Date;
}

export interface RequestStepSnapshot {
  readonly id: string;
  readonly stepNo: number;
  readonly name: string;
  readonly approverRole: string;
  readonly requiredApprovals: number;
  readonly status: StepStatus;
  readonly decisions: readonly DecisionSnapshot[];
}

export interface ApprovalRequestSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly documentType: string;
  readonly documentId: string;
  readonly policyId: string | null;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly requestedBy: string;
  readonly status: ApprovalStatus;
  readonly currentStepNo: number | null;
  readonly steps: readonly RequestStepSnapshot[];
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly updatedAt: Date;
}

export interface CreateApprovalRequestProps {
  readonly id: string;
  readonly tenantId: string;
  readonly documentType: string;
  readonly documentId: string;
  readonly policyId: string | null;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly requestedBy: string;
  /** Already filtered by the policy's amount tiers; empty = auto-approve. */
  readonly steps: readonly (ApprovalPolicyStepSnapshot & {
    readonly requestStepId: string;
  })[];
  readonly now: Date;
}

/** What the decider brings: their own roles plus roles inherited via delegation. */
export interface Decider {
  readonly userId: string;
  readonly ownRoles: readonly string[];
  /** fromUserId -> that user's roles, for delegations active today. */
  readonly delegatedRoles: ReadonlyMap<string, readonly string[]>;
}

export interface DecideInput {
  readonly decider: Decider;
  readonly decision: Decision;
  readonly comment?: string | null;
  readonly decisionId: string;
  readonly now: Date;
}

/**
 * Multi-step, conditional approval with segregation of duties:
 *   - the requester can never decide their own request (R3 pattern);
 *   - each step needs `requiredApprovals` distinct APPROVEs from holders
 *     of its role (own or delegated); any REJECT ends the request;
 *   - a user decides a step at most once, delegated or not.
 * A request with no applicable steps is APPROVED on creation.
 */
export class ApprovalRequest {
  private constructor(private readonly s: ApprovalRequestSnapshot) {}

  static create(props: CreateApprovalRequestProps): ApprovalRequest {
    if (props.amountMinor < 0n) {
      throw new InvalidApprovalRequestError('amount must not be negative');
    }
    const steps: RequestStepSnapshot[] = props.steps.map((st, i) => ({
      id: st.requestStepId,
      stepNo: i + 1,
      name: st.name,
      approverRole: st.approverRole,
      requiredApprovals: st.requiredApprovals,
      status: StepStatus.Pending,
      decisions: [],
    }));
    const auto = steps.length === 0;
    return new ApprovalRequest({
      id: props.id,
      tenantId: props.tenantId,
      documentType: props.documentType,
      documentId: props.documentId,
      policyId: props.policyId,
      amountMinor: props.amountMinor,
      currency: props.currency.toUpperCase(),
      requestedBy: props.requestedBy,
      status: auto ? ApprovalStatus.Approved : ApprovalStatus.Pending,
      currentStepNo: auto ? null : 1,
      steps,
      createdAt: props.now,
      resolvedAt: auto ? props.now : null,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ApprovalRequestSnapshot): ApprovalRequest {
    return new ApprovalRequest(s);
  }

  get isPending(): boolean {
    return this.s.status === ApprovalStatus.Pending;
  }

  currentStep(): RequestStepSnapshot | null {
    if (this.s.currentStepNo === null) return null;
    return (
      this.s.steps.find((st) => st.stepNo === this.s.currentStepNo) ?? null
    );
  }

  /** Can this decider act on the current step? (role check only; SoD/duplicate are enforced in decide) */
  eligibilityOf(decider: Decider): {
    eligible: boolean;
    onBehalfOf: string | null;
  } {
    const step = this.currentStep();
    if (!step) return { eligible: false, onBehalfOf: null };
    if (decider.ownRoles.includes(step.approverRole)) {
      return { eligible: true, onBehalfOf: null };
    }
    for (const [from, roles] of decider.delegatedRoles) {
      if (roles.includes(step.approverRole))
        return { eligible: true, onBehalfOf: from };
    }
    return { eligible: false, onBehalfOf: null };
  }

  decide(input: DecideInput): ApprovalRequest {
    if (this.s.status !== ApprovalStatus.Pending) {
      throw new ApprovalNotPendingError(this.s.id, this.s.status);
    }
    const step = this.currentStep();
    if (!step)
      throw new InvalidApprovalRequestError(
        'pending request has no current step',
      );
    const { userId } = input.decider;
    if (userId === this.s.requestedBy) throw new SelfApprovalError(this.s.id);
    const { eligible, onBehalfOf } = this.eligibilityOf(input.decider);
    if (!eligible) {
      throw new NotAnEligibleApproverError(
        this.s.id,
        step.stepNo,
        step.approverRole,
      );
    }
    if (onBehalfOf === this.s.requestedBy)
      throw new SelfApprovalError(this.s.id);
    if (
      step.decisions.some(
        (d) => d.decidedBy === userId || d.onBehalfOf === userId,
      )
    ) {
      throw new AlreadyDecidedError(this.s.id, step.stepNo);
    }
    const comment = (input.comment ?? '').trim() || null;
    if (comment !== null && comment.length > 500) {
      throw new InvalidApprovalRequestError(
        'comment must be <= 500 characters',
      );
    }
    const decision: DecisionSnapshot = {
      id: input.decisionId,
      decidedBy: userId,
      onBehalfOf,
      decision: input.decision,
      comment,
      decidedAt: input.now,
    };
    const decisions = [...step.decisions, decision];

    if (input.decision === Decision.Reject) {
      return this.withStep(
        { ...step, decisions, status: StepStatus.Rejected },
        {
          status: ApprovalStatus.Rejected,
          currentStepNo: null,
          resolvedAt: input.now,
        },
        input.now,
      );
    }
    const approvals = decisions.filter(
      (d) => d.decision === Decision.Approve,
    ).length;
    if (approvals < step.requiredApprovals) {
      return this.withStep({ ...step, decisions }, {}, input.now);
    }
    const next = this.s.steps.find((st) => st.stepNo === step.stepNo + 1);
    return this.withStep(
      { ...step, decisions, status: StepStatus.Approved },
      next
        ? { currentStepNo: next.stepNo }
        : {
            status: ApprovalStatus.Approved,
            currentStepNo: null,
            resolvedAt: input.now,
          },
      input.now,
    );
  }

  cancel(by: string, now: Date): ApprovalRequest {
    if (this.s.status !== ApprovalStatus.Pending) {
      throw new ApprovalNotPendingError(this.s.id, this.s.status);
    }
    if (by !== this.s.requestedBy) throw new NotTheRequesterError(this.s.id);
    return new ApprovalRequest({
      ...this.s,
      status: ApprovalStatus.Cancelled,
      currentStepNo: null,
      resolvedAt: now,
      updatedAt: now,
    });
  }

  private withStep(
    step: RequestStepSnapshot,
    header: Partial<
      Pick<ApprovalRequestSnapshot, 'status' | 'currentStepNo' | 'resolvedAt'>
    >,
    now: Date,
  ): ApprovalRequest {
    return new ApprovalRequest({
      ...this.s,
      ...header,
      steps: this.s.steps.map((st) => (st.stepNo === step.stepNo ? step : st)),
      updatedAt: now,
    });
  }

  snapshot(): ApprovalRequestSnapshot {
    return this.s;
  }
}
