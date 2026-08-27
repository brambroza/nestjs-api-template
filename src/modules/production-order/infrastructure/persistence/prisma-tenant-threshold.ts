import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TenantDefaultsConfig } from '../../../../shared/config';
import { PrismaService } from '../../../../shared/database';
import {
  type ApprovalThresholdPolicy,
  Money,
  SimpleThresholdPolicy,
  type TenantId,
} from '../../domain';
import type { ApprovalThresholdProvider } from '../../application/ports/approval-threshold.port';

@Injectable()
export class PrismaTenantThresholdProvider implements ApprovalThresholdProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forTenant(tenantId: TenantId): Promise<ApprovalThresholdPolicy> {
    const row = await this.prisma.tenant.findUnique({
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
