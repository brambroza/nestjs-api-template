import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import type { TenantDefaultsConfig } from '../../../../shared/config';
import { PrismaTransactionManager } from '../../../../shared/database';
import {
  type TenantId,
  tolerancePolicy,
  type TolerancePolicy,
} from '../../domain';
import type { TolerancePolicyProvider } from '../../application/ports/tolerance-policy.port';

type TenantReadClient = Pick<Prisma.TransactionClient, 'tenant'>;

/**
 * Reads via `tx.getClient()` so the read joins the same transaction as
 * the calling use case — ADR 0002 §3.5 invariant. Fixed as part of the
 * Phase 5 review.
 */
@Injectable()
export class PrismaTenantToleranceProvider implements TolerancePolicyProvider {
  constructor(
    private readonly tx: PrismaTransactionManager,
    private readonly config: ConfigService,
  ) {}

  async forTenant(tenantId: TenantId): Promise<TolerancePolicy> {
    const client = this.tx.getClient() as unknown as TenantReadClient;
    const row = await client.tenant.findUnique({
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
