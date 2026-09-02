import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import type {
  BranchLookup,
  BranchLookupResult,
} from '../application/ports/branch-lookup.port';

/** Reads md_branch directly — warehouse owns this port and its adapter. */
@Injectable()
export class PrismaBranchLookup implements BranchLookup {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    tenantId: string,
    branchId: string,
  ): Promise<BranchLookupResult | null> {
    const row = await this.prisma.branch.findFirst({
      where: { tenantId, id: branchId },
      select: { isActive: true },
    });
    return row ? { isActive: row.isActive } : null;
  }
}
