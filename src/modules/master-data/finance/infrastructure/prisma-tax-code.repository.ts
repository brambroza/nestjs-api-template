import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  TaxCode,
  isPndForm,
  isTaxKind,
  isVatTreatment,
  type ItemTaxOverrideSnapshot,
  type TaxCodeSnapshot,
  type TaxKind,
} from '../domain';
import type { TaxCodeRepository } from '../application/ports/tax-code.repository';

@Injectable()
export class PrismaTaxCodeRepository implements TaxCodeRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<TaxCode | null> {
    const row = await this.txm
      .getClient()
      .taxCode.findFirst({ where: { tenantId, id } });
    return row ? TaxCode.fromSnapshot(toSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<TaxCode | null> {
    const row = await this.txm
      .getClient()
      .taxCode.findFirst({ where: { tenantId, code } });
    return row ? TaxCode.fromSnapshot(toSnapshot(row)) : null;
  }

  async findDefault(tenantId: string, kind: TaxKind): Promise<TaxCode | null> {
    const row = await this.txm.getClient().taxCode.findFirst({
      where: { tenantId, kind, isDefault: true, isActive: true },
    });
    return row ? TaxCode.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: { readonly kind?: TaxKind | null; readonly activeOnly: boolean },
  ): Promise<readonly TaxCode[]> {
    const rows = await this.txm.getClient().taxCode.findMany({
      where: {
        tenantId,
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => TaxCode.fromSnapshot(toSnapshot(r)));
  }

  async create(taxCode: TaxCode): Promise<void> {
    const s = taxCode.snapshot();
    await this.txm.getClient().taxCode.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        kind: s.kind,
        rateBasisPoints: s.rateBasisPoints,
        vatTreatment: s.vatTreatment,
        pndForm: s.pndForm,
        whtIncomeType: s.whtIncomeType,
        isDefault: s.isDefault,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }

  async findOverride(
    tenantId: string,
    itemId: string,
    kind: TaxKind,
  ): Promise<ItemTaxOverrideSnapshot | null> {
    const row = await this.txm
      .getClient()
      .itemTaxOverride.findFirst({ where: { tenantId, itemId, kind } });
    if (!row) return null;
    if (!isTaxKind(row.kind))
      throw new Error(
        `fin_item_tax_override.kind holds unknown value "${row.kind}"`,
      );
    return { ...row, kind: row.kind };
  }

  async upsertOverride(o: ItemTaxOverrideSnapshot): Promise<void> {
    await this.txm.getClient().itemTaxOverride.upsert({
      where: {
        tenantId_itemId_kind: {
          tenantId: o.tenantId,
          itemId: o.itemId,
          kind: o.kind,
        },
      },
      update: { taxCodeId: o.taxCodeId, reason: o.reason },
      create: {
        id: o.id,
        tenantId: o.tenantId,
        itemId: o.itemId,
        kind: o.kind,
        taxCodeId: o.taxCodeId,
        reason: o.reason,
        createdAt: o.createdAt,
      },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  kind: string;
  rateBasisPoints: bigint;
  vatTreatment: string | null;
  pndForm: string | null;
  whtIncomeType: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TaxCodeSnapshot {
  if (!isTaxKind(row.kind))
    throw new Error(`fin_tax_code.kind holds unknown value "${row.kind}"`);
  if (row.vatTreatment !== null && !isVatTreatment(row.vatTreatment)) {
    throw new Error(
      `fin_tax_code.vatTreatment holds unknown value "${row.vatTreatment}"`,
    );
  }
  if (row.pndForm !== null && !isPndForm(row.pndForm)) {
    throw new Error(
      `fin_tax_code.pndForm holds unknown value "${row.pndForm}"`,
    );
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    kind: row.kind,
    rateBasisPoints: row.rateBasisPoints,
    vatTreatment: row.vatTreatment,
    pndForm: row.pndForm,
    whtIncomeType: row.whtIncomeType,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
