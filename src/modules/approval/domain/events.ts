/**
 * Domain events written to the transactional outbox (ADR 0003) in the
 * same transaction as the request change. The notification worker
 * delivers them; approvers get a LINE ping when a document lands in
 * their queue, requesters when it is decided.
 */
export interface ApprovalEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly documentType: string;
  readonly documentId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
}

export interface ApprovalRequestedEvent extends ApprovalEventBase {
  readonly type: 'approval.requested.v1';
  readonly requestedBy: string;
  readonly stepNo: number;
  readonly approverRole: string;
}

export interface ApprovalStepAdvancedEvent extends ApprovalEventBase {
  readonly type: 'approval.step_advanced.v1';
  readonly stepNo: number;
  readonly approverRole: string;
}

export interface ApprovalDecidedEvent extends ApprovalEventBase {
  readonly type:
    'approval.approved.v1' | 'approval.rejected.v1' | 'approval.cancelled.v1';
  readonly actor: string;
  readonly requestedBy: string;
}

export type ApprovalEvent =
  ApprovalRequestedEvent | ApprovalStepAdvancedEvent | ApprovalDecidedEvent;
