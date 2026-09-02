import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { PartnerType, type PartnerRef } from '../domain';
import type {
  PartnerLookup,
  PartnerLookupResult,
} from '../application/ports/partner-lookup.port';

/** Reads md_customer / md_vendor directly — partner module owns this port + adapter. */
@Injectable()
export class PrismaPartnerLookup implements PartnerLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async find(
    tenantId: string,
    ref: PartnerRef,
  ): Promise<PartnerLookupResult | null> {
    const db = this.txm.getClient();
    const select = { isActive: true, code: true, name: true, taxId: true };
    const row =
      ref.type === PartnerType.Customer
        ? await db.customer.findFirst({
            where: { tenantId, id: ref.id },
            select,
          })
        : await db.vendor.findFirst({
            where: { tenantId, id: ref.id },
            select,
          });
    return row
      ? {
          isActive: row.isActive,
          code: row.code,
          name: row.name,
          taxId: row.taxId,
        }
      : null;
  }
}
