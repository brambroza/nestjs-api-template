import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  PartnerAddress,
  type AddressType,
  type PartnerAddressSnapshot,
  type PartnerRef,
} from '../domain';
import type { AddressRepository } from '../application/ports/address.repository';

import { toAddressType, toPartnerRef } from './mappers';

@Injectable()
export class PrismaAddressRepository implements AddressRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<PartnerAddress | null> {
    const row = await this.txm
      .getClient()
      .partnerAddress.findFirst({ where: { tenantId, id } });
    return row ? PartnerAddress.fromSnapshot(toSnapshot(row)) : null;
  }

  async findDefault(
    tenantId: string,
    partner: PartnerRef,
    addressType: AddressType,
  ): Promise<PartnerAddress | null> {
    const row = await this.txm.getClient().partnerAddress.findFirst({
      where: {
        tenantId,
        partnerType: partner.type,
        partnerId: partner.id,
        addressType,
        isDefault: true,
      },
    });
    return row ? PartnerAddress.fromSnapshot(toSnapshot(row)) : null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly PartnerAddress[]> {
    const rows = await this.txm.getClient().partnerAddress.findMany({
      where: {
        tenantId,
        partnerType: partner.type,
        partnerId: partner.id,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [
        { addressType: 'asc' },
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    return rows.map((r) => PartnerAddress.fromSnapshot(toSnapshot(r)));
  }

  async create(address: PartnerAddress): Promise<void> {
    const s = address.snapshot();
    await this.txm.getClient().partnerAddress.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        partnerType: s.partner.type,
        partnerId: s.partner.id,
        addressType: s.addressType,
        label: s.label,
        line1: s.address.line1,
        line2: s.address.line2,
        subDistrict: s.address.subDistrict,
        district: s.address.district,
        province: s.address.province,
        postalCode: s.address.postalCode,
        countryCode: s.countryCode,
        branchNumber: s.branchNumber,
        isDefault: s.isDefault,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  partnerType: string;
  partnerId: string;
  addressType: string;
  label: string | null;
  line1: string;
  line2: string | null;
  subDistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  branchNumber: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PartnerAddressSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partner: toPartnerRef('md_partner_address', row),
    addressType: toAddressType(row.addressType),
    label: row.label,
    address: {
      line1: row.line1,
      line2: row.line2,
      subDistrict: row.subDistrict,
      district: row.district,
      province: row.province,
      postalCode: row.postalCode,
    },
    countryCode: row.countryCode,
    branchNumber: row.branchNumber,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
