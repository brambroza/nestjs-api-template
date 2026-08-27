import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TenantDefaultsConfig } from '../../../../shared/config';
import { PrismaService } from '../../../../shared/database';
import {
  type TenantId,
  tolerancePolicy,
  type TolerancePolicy,
} from '../../domain';
import type { TolerancePolicyProvider } from '../../application/ports/tolerance-policy.port';

@Injectable()
export class PrismaTenantToleranceProvider implements TolerancePolicyProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forTenant(tenantId: TenantId): Promise<TolerancePolicy> {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        overToleranceBasisPoints: true,
        underToleranceBasisPoints: true,
      },
    });
    if (row) {
      return tolerancePolicy(
        row.overToleranceBasisPoints,
        row.underToleranceBasisPoints,
      );
    }
    const defaults =
      this.config.getOrThrow<TenantDefaultsConfig>('tenantDefaults');
    return tolerancePolicy(
      defaults.overToleranceBasisPoints,
      defaults.underToleranceBasisPoints,
    );
  }
}
