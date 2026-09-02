import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import { Delegation, type DelegationSnapshot } from '../domain';
import type { DelegationRepository } from '../application/ports/delegation.repository';

const toDb = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const fromDb = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaDelegationRepository implements DelegationRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Delegation | null> {
    const row = await this.txm
      .getClient()
      .approvalDelegation.findFirst({ where: { tenantId, id } });
    return row ? Delegation.fromSnapshot(toSnapshot(row)) : null;
  }

  async listActiveTo(
    tenantId: string,
    toUserId: string,
    date: string,
  ): Promise<readonly Delegation[]> {
    const d = toDb(date);
    const rows = await this.txm.getClient().approvalDelegation.findMany({
      where: {
        tenantId,
        toUserId,
        isActive: true,
        fromDate: { lte: d },
        toDate: { gte: d },
      },
    });
    return rows.map((r) => Delegation.fromSnapshot(toSnapshot(r)));
  }

  async listFrom(
    tenantId: string,
    fromUserId: string,
  ): Promise<readonly Delegation[]> {
    const rows = await this.txm.getClient().approvalDelegation.findMany({
      where: { tenantId, fromUserId },
      orderBy: { fromDate: 'desc' },
    });
    return rows.map((r) => Delegation.fromSnapshot(toSnapshot(r)));
  }

  async create(delegation: Delegation): Promise<void> {
    const s = delegation.snapshot();
    await this.txm.getClient().approvalDelegation.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        fromDate: toDb(s.fromDate),
        toDate: toDb(s.toDate),
        reason: s.reason,
        isActive: s.isActive,
        createdAt: s.createdAt,
      },
    });
  }

  async save(delegation: Delegation): Promise<void> {
    const s = delegation.snapshot();
    await this.txm.getClient().approvalDelegation.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: { isActive: s.isActive },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  fromUserId: string;
  toUserId: string;
  fromDate: Date;
  toDate: Date;
  reason: string | null;
  isActive: boolean;
  createdAt: Date;
}): DelegationSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    fromDate: fromDb(row.fromDate),
    toDate: fromDb(row.toDate),
    reason: row.reason,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
