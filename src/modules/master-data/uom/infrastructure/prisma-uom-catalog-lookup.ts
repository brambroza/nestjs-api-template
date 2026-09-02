import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import type { UomCatalogLookup } from '../../item/application/ports/uom-catalog.port';

/**
 * Adapter that implements the item module's `UomCatalogLookup` port
 * by hitting the UoM table directly. Lives in the UoM module so item
 * has no direct dependency on the UoM aggregate.
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
