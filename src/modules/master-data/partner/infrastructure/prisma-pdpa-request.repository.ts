import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  PdpaRequest,
  PdpaRequestStatus,
  type PartnerRef,
  type PdpaRequestSnapshot,
  type PdpaRequestType,
} from '../domain';
import type { PdpaRequestRepository } from '../application/ports/pdpa-request.repository';

import {
  toPartnerRef,
  toPdpaRequestStatus,
  toPdpaRequestType,
} from './mappers';

@Injectable()
export class PrismaPdpaRequestRepository implements PdpaRequestRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<PdpaRequest | null> {
    const row = await this.txm
      .getClient()
      .pdpaRequest.findFirst({ where: { tenantId, id } });
    return row ? PdpaRequest.fromSnapshot(toSnapshot(row)) : null;
  }

  async findPending(
    tenantId: string,
    partner: PartnerRef,
    requestType: PdpaRequestType,
  ): Promise<PdpaRequest | null> {
    const row = await this.txm.getClient().pdpaRequest.findFirst({
      where: {
        tenantId,
        partnerType: partner.type,
        partnerId: partner.id,
        requestType,
        status: PdpaRequestStatus.Pending,
      },
    });
    return row ? PdpaRequest.fromSnapshot(toSnapshot(row)) : null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly PdpaRequest[]> {
    const rows = await this.txm.getClient().pdpaRequest.findMany({
      where: { tenantId, partnerType: partner.type, partnerId: partner.id },
      orderBy: [{ requestedAt: 'desc' }],
    });
    return rows.map((r) => PdpaRequest.fromSnapshot(toSnapshot(r)));
  }

  async create(request: PdpaRequest): Promise<void> {
    const s = request.snapshot();
    await this.txm.getClient().pdpaRequest.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        partnerType: s.partner.type,
        partnerId: s.partner.id,
        requestType: s.requestType,
        status: s.status,
        reason: s.reason,
        requestedBy: s.requestedBy,
        requestedAt: s.requestedAt,
        completedBy: s.completedBy,
        completedAt: s.completedAt,
        resultNote: s.resultNote,
      },
    });
  }

  async save(request: PdpaRequest): Promise<void> {
    const s = request.snapshot();
    await this.txm.getClient().pdpaRequest.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: {
        status: s.status,
        completedBy: s.completedBy,
        completedAt: s.completedAt,
        resultNote: s.resultNote,
      },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  partnerType: string;
  partnerId: string;
  requestType: string;
  status: string;
  reason: string | null;
  requestedBy: string;
  requestedAt: Date;
  completedBy: string | null;
  completedAt: Date | null;
  resultNote: string | null;
}): PdpaRequestSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partner: toPartnerRef('pdpa_request', row),
    requestType: toPdpaRequestType(row.requestType),
    status: toPdpaRequestStatus(row.status),
    reason: row.reason,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    completedBy: row.completedBy,
    completedAt: row.completedAt,
    resultNote: row.resultNote,
  };
}
