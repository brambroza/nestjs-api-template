import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import type {
  CompanyLookup,
  CompanyLookupResult,
} from '../application/ports/company-lookup.port';

/** Reads md_company directly — branch owns this port and its adapter. */
@Injectable()
export class PrismaCompanyLookup implements CompanyLookup {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    tenantId: string,
    companyId: string,
  ): Promise<CompanyLookupResult | null> {
    const row = await this.prisma.company.findFirst({
      where: { tenantId, id: companyId },
      select: { isActive: true },
    });
    return row ? { isActive: row.isActive } : null;
  }
}
