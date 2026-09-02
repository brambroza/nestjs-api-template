import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import type { UomCatalogLookup } from '../application/ports/uom-catalog.port';

/**
 * Reads the UoM table directly rather than calling into the UoM module —
 * same compromise as production-order's PrismaBomLookup. The item module
 * owns the port AND the adapter; the UoM module never learns item exists.
 * If the UoM table shape changes, this file and the UoM repository are
 * the two places to update.
 */
@Injectable()
export class PrismaUomCatalogLookup implements UomCatalogLookup {
  constructor(private readonly prisma: PrismaService) {}

  async exists(tenantId: string, code: string): Promise<boolean> {
    const row = await this.prisma.uomDefinition.findFirst({
      where: { tenantId, code },
      select: { id: true },
    });
    return row !== null;
  }
}
