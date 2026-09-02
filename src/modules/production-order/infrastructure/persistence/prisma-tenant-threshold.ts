import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import type { TenantDefaultsConfig } from '../../../../shared/config';
import { PrismaTransactionManager } from '../../../../shared/database';
import {
  type ApprovalThresholdPolicy,
  Money,
  SimpleThresholdPolicy,
  type TenantId,
} from '../../domain';
import type { ApprovalThresholdProvider } from '../../application/ports/approval-threshold.port';

type TenantReadClient = Pick<Prisma.TransactionClient, 'tenant'>;

/**
 * Reads via `tx.getClient()` so the read joins the same transaction as
 * the calling use case — ADR 0002 §3.5 invariant. Fixed as part of the
 * Phase 5 review (was previously reading via the base PrismaService).
 */
@Injectable()
export class PrismaTenantThresholdProvider implements ApprovalThresholdProvider {
  constructor(
    private readonly tx: PrismaTransactionManager,
    private readonly config: ConfigService,
  ) {}

  async forTenant(tenantId: TenantId): Promise<ApprovalThresholdPolicy> {
    const client = this.tx.getClient() as unknown as TenantReadClient;
    const row = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { dualApprovalThresholdSatang: true },
    });
    if (row) {
      return new SimpleThresholdPolicy(
        Money.thb(row.dualApprovalThresholdSatang),
      );
    }
    const fallback =
      this.config.getOrThrow<TenantDefaultsConfig>(
        'tenantDefaults',
      ).dualApprovalThresholdSatang;
    return new SimpleThresholdPolicy(Money.thb(fallback));
  }
}
