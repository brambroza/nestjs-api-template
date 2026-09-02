import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  ConsentRecord,
  type ConsentRecordSnapshot,
  type PartnerRef,
} from '../domain';
import type { ConsentRepository } from '../application/ports/consent.repository';

import {
  toConsentAction,
  toConsentPurpose,
  toConsentSource,
  toPartnerRef,
} from './mappers';

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async append(record: ConsentRecord): Promise<void> {
    const s = record.snapshot();
    await this.txm.getClient().pdpaConsent.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        partnerType: s.partner.type,
        partnerId: s.partner.id,
        contactId: s.contactId,
        purpose: s.purpose,
        action: s.action,
        source: s.source,
        evidenceRef: s.evidenceRef,
        note: s.note,
        recordedBy: s.recordedBy,
        recordedAt: s.recordedAt,
      },
    });
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly ConsentRecord[]> {
    const rows = await this.txm.getClient().pdpaConsent.findMany({
      where: { tenantId, partnerType: partner.type, partnerId: partner.id },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ConsentRecord.fromSnapshot(toSnapshot(r)));
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  partnerType: string;
  partnerId: string;
  contactId: string | null;
  purpose: string;
  action: string;
  source: string;
  evidenceRef: string | null;
  note: string | null;
  recordedBy: string;
  recordedAt: Date;
}): ConsentRecordSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partner: toPartnerRef('pdpa_consent', row),
    contactId: row.contactId,
    purpose: toConsentPurpose(row.purpose),
    action: toConsentAction(row.action),
    source: toConsentSource(row.source),
    evidenceRef: row.evidenceRef,
    note: row.note,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt,
  };
}
