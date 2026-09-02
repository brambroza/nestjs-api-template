import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import { ApprovalPolicy, type ApprovalPolicySnapshot } from '../domain';
import type { ApprovalPolicyRepository } from '../application/ports/approval-policy.repository';

const withSteps = { steps: { orderBy: { stepNo: 'asc' as const } } };

@Injectable()
export class PrismaApprovalPolicyRepository implements ApprovalPolicyRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<ApprovalPolicy | null> {
    const row = await this.txm.getClient().approvalPolicy.findFirst({
      where: { tenantId, id },
      include: withSteps,
    });
    return row ? ApprovalPolicy.fromSnapshot(toSnapshot(row)) : null;
  }

  async findActive(
    tenantId: string,
    documentType: string,
  ): Promise<ApprovalPolicy | null> {
    const row = await this.txm.getClient().approvalPolicy.findFirst({
      where: { tenantId, documentType, isActive: true },
      include: withSteps,
    });
    return row ? ApprovalPolicy.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly ApprovalPolicy[]> {
    const rows = await this.txm.getClient().approvalPolicy.findMany({
      where: { tenantId, ...(opts.activeOnly ? { isActive: true } : {}) },
      include: withSteps,
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ApprovalPolicy.fromSnapshot(toSnapshot(r)));
  }

  async create(policy: ApprovalPolicy): Promise<void> {
    const s = policy.snapshot();
    await this.txm.getClient().approvalPolicy.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        documentType: s.documentType,
        name: s.name,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        steps: {
          create: s.steps.map((st) => ({
            id: st.id,
            tenantId: s.tenantId,
            stepNo: st.stepNo,
            name: st.name,
            approverRole: st.approverRole,
            minAmountMinor: st.minAmountMinor,
            requiredApprovals: st.requiredApprovals,
          })),
        },
      },
    });
  }

  async save(policy: ApprovalPolicy): Promise<void> {
    const s = policy.snapshot();
    await this.txm.getClient().approvalPolicy.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: { isActive: s.isActive, name: s.name, updatedAt: s.updatedAt },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  documentType: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  steps: readonly {
    id: string;
    stepNo: number;
    name: string;
    approverRole: string;
    minAmountMinor: bigint | null;
    requiredApprovals: number;
  }[];
}): ApprovalPolicySnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentType: row.documentType,
    name: row.name,
    isActive: row.isActive,
    steps: row.steps.map((st) => ({
      id: st.id,
      stepNo: st.stepNo,
      name: st.name,
      approverRole: st.approverRole,
      minAmountMinor: st.minAmountMinor,
      requiredApprovals: st.requiredApprovals,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
