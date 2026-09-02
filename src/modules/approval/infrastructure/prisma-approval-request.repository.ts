import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import {
  ApprovalRequest,
  ApprovalStatus,
  StepStatus,
  isApprovalStatus,
  isDecision,
  isStepStatus,
  type ApprovalRequestSnapshot,
} from '../domain';
import type { ApprovalRequestRepository } from '../application/ports/approval-request.repository';

const withSteps = {
  steps: {
    orderBy: { stepNo: 'asc' as const },
    include: { decisions: { orderBy: { decidedAt: 'asc' as const } } },
  },
};

@Injectable()
export class PrismaApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ApprovalRequest | null> {
    const row = await this.txm.getClient().approvalRequest.findFirst({
      where: { tenantId, id },
      include: withSteps,
    });
    return row ? ApprovalRequest.fromSnapshot(toSnapshot(row)) : null;
  }

  async findPendingForDocument(
    tenantId: string,
    documentType: string,
    documentId: string,
  ): Promise<ApprovalRequest | null> {
    const row = await this.txm.getClient().approvalRequest.findFirst({
      where: {
        tenantId,
        documentType,
        documentId,
        status: ApprovalStatus.Pending,
      },
      include: withSteps,
    });
    return row ? ApprovalRequest.fromSnapshot(toSnapshot(row)) : null;
  }

  async listForDocument(
    tenantId: string,
    documentType: string,
    documentId: string,
  ): Promise<readonly ApprovalRequest[]> {
    const rows = await this.txm.getClient().approvalRequest.findMany({
      where: { tenantId, documentType, documentId },
      include: withSteps,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ApprovalRequest.fromSnapshot(toSnapshot(r)));
  }

  async listPendingForRoles(
    tenantId: string,
    roles: readonly string[],
  ): Promise<readonly ApprovalRequest[]> {
    if (roles.length === 0) return [];
    const rows = await this.txm.getClient().approvalRequest.findMany({
      where: {
        tenantId,
        status: ApprovalStatus.Pending,
        steps: {
          some: {
            status: StepStatus.Pending,
            approverRole: { in: [...roles] },
          },
        },
      },
      include: withSteps,
      orderBy: { createdAt: 'asc' },
    });
    // `some` matches any pending step; the domain narrows to the CURRENT step.
    return rows
      .map((r) => ApprovalRequest.fromSnapshot(toSnapshot(r)))
      .filter((r) => {
        const step = r.currentStep();
        return step !== null && roles.includes(step.approverRole);
      });
  }

  async create(request: ApprovalRequest): Promise<void> {
    const s = request.snapshot();
    await this.txm.getClient().approvalRequest.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        documentType: s.documentType,
        documentId: s.documentId,
        policyId: s.policyId,
        amountMinor: s.amountMinor,
        currency: s.currency,
        requestedBy: s.requestedBy,
        status: s.status,
        currentStepNo: s.currentStepNo,
        createdAt: s.createdAt,
        resolvedAt: s.resolvedAt,
        updatedAt: s.updatedAt,
        steps: {
          create: s.steps.map((st) => ({
            id: st.id,
            tenantId: s.tenantId,
            stepNo: st.stepNo,
            name: st.name,
            approverRole: st.approverRole,
            requiredApprovals: st.requiredApprovals,
            status: st.status,
          })),
        },
      },
    });
  }

  async save(request: ApprovalRequest): Promise<void> {
    const s = request.snapshot();
    const db = this.txm.getClient();
    await db.approvalRequest.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: {
        status: s.status,
        currentStepNo: s.currentStepNo,
        resolvedAt: s.resolvedAt,
        updatedAt: s.updatedAt,
      },
    });
    for (const st of s.steps) {
      await db.approvalRequestStep.update({
        where: { id: st.id, tenantId: s.tenantId },
        data: { status: st.status },
      });
      for (const d of st.decisions) {
        await db.approvalDecision.upsert({
          where: { id: d.id },
          update: {},
          create: {
            id: d.id,
            tenantId: s.tenantId,
            stepId: st.id,
            decidedBy: d.decidedBy,
            onBehalfOf: d.onBehalfOf,
            decision: d.decision,
            comment: d.comment,
            decidedAt: d.decidedAt,
          },
        });
      }
    }
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  documentType: string;
  documentId: string;
  policyId: string | null;
  amountMinor: bigint;
  currency: string;
  requestedBy: string;
  status: string;
  currentStepNo: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date;
  steps: readonly {
    id: string;
    stepNo: number;
    name: string;
    approverRole: string;
    requiredApprovals: number;
    status: string;
    decisions: readonly {
      id: string;
      decidedBy: string;
      onBehalfOf: string | null;
      decision: string;
      comment: string | null;
      decidedAt: Date;
    }[];
  }[];
}): ApprovalRequestSnapshot {
  if (!isApprovalStatus(row.status))
    throw new Error(`apv_request.status holds unknown value "${row.status}"`);
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentType: row.documentType,
    documentId: row.documentId,
    policyId: row.policyId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    requestedBy: row.requestedBy,
    status: row.status,
    currentStepNo: row.currentStepNo,
    steps: row.steps.map((st) => {
      if (!isStepStatus(st.status))
        throw new Error(
          `apv_request_step.status holds unknown value "${st.status}"`,
        );
      return {
        id: st.id,
        stepNo: st.stepNo,
        name: st.name,
        approverRole: st.approverRole,
        requiredApprovals: st.requiredApprovals,
        status: st.status,
        decisions: st.decisions.map((d) => {
          if (!isDecision(d.decision))
            throw new Error(
              `apv_decision.decision holds unknown value "${d.decision}"`,
            );
          return {
            id: d.id,
            decidedBy: d.decidedBy,
            onBehalfOf: d.onBehalfOf,
            decision: d.decision,
            comment: d.comment,
            decidedAt: d.decidedAt,
          };
        }),
      };
    }),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    updatedAt: row.updatedAt,
  };
}
