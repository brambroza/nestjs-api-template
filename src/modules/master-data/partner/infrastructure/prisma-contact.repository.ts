import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { Contact, type ContactSnapshot, type PartnerRef } from '../domain';
import type { ContactRepository } from '../application/ports/contact.repository';

import { toPartnerRef } from './mappers';

/**
 * All access goes through `txm.getClient()` so a call inside
 * FulfilPdpaRequestUseCase's transaction sees the tx handle (ADR 0002).
 */
@Injectable()
export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Contact | null> {
    const row = await this.txm
      .getClient()
      .partnerContact.findFirst({ where: { tenantId, id } });
    return row ? Contact.fromSnapshot(toSnapshot(row)) : null;
  }

  async findPrimary(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<Contact | null> {
    const row = await this.txm.getClient().partnerContact.findFirst({
      where: {
        tenantId,
        partnerType: partner.type,
        partnerId: partner.id,
        isPrimary: true,
      },
    });
    return row ? Contact.fromSnapshot(toSnapshot(row)) : null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Contact[]> {
    const rows = await this.txm.getClient().partnerContact.findMany({
      where: {
        tenantId,
        partnerType: partner.type,
        partnerId: partner.id,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
    });
    return rows.map((r) => Contact.fromSnapshot(toSnapshot(r)));
  }

  async create(contact: Contact): Promise<void> {
    const s = contact.snapshot();
    await this.txm.getClient().partnerContact.create({ data: toRow(s) });
  }

  async save(contact: Contact): Promise<void> {
    const s = contact.snapshot();
    const { id, tenantId, createdAt, ...rest } = toRow(s);
    void createdAt;
    await this.txm.getClient().partnerContact.update({
      where: { id, tenantId },
      data: rest,
    });
  }
}

function toRow(s: ContactSnapshot): {
  id: string;
  tenantId: string;
  partnerType: string;
  partnerId: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  erasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: s.id,
    tenantId: s.tenantId,
    partnerType: s.partner.type,
    partnerId: s.partner.id,
    fullName: s.fullName,
    position: s.position,
    email: s.email,
    phone: s.phone,
    isPrimary: s.isPrimary,
    isActive: s.isActive,
    erasedAt: s.erasedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  partnerType: string;
  partnerId: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  erasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ContactSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partner: toPartnerRef('md_partner_contact', row),
    fullName: row.fullName,
    position: row.position,
    email: row.email,
    phone: row.phone,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    erasedAt: row.erasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
