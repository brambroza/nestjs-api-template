import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

/**
 * Global fallback defaults for per-tenant business rules. The real
 * per-tenant threshold overrides this via master-data (Phase 4d);
 * this config exists so a fresh install has legal defaults on day 1.
 */
export interface TenantDefaultsConfig {
  readonly dualApprovalThresholdSatang: bigint;
  readonly overToleranceBasisPoints: bigint;
  readonly underToleranceBasisPoints: bigint;
}

export default registerAs<TenantDefaultsConfig>('tenantDefaults', () => {
  const env = validateEnv(process.env);
  return {
    dualApprovalThresholdSatang: env.DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG,
    overToleranceBasisPoints: env.DEFAULT_OVER_TOLERANCE_BASIS_POINTS,
    underToleranceBasisPoints: env.DEFAULT_UNDER_TOLERANCE_BASIS_POINTS,
  };
});
