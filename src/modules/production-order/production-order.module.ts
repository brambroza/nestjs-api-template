import { Module } from '@nestjs/common';

import { CLOCK } from './application/ports/clock.port';
import { TENANT_CONTEXT } from './application/ports/tenant-context.port';
import { ClsTenantContextService } from './infrastructure/services/cls-tenant-context.service';
import { SystemClockService } from './infrastructure/services/system-clock.service';

/**
 * Phase 4a binds the platform ports (Clock, TenantContext) so the
 * module boots. Business-layer ports (repository, outbox, threshold
 * provider, calendar, inventory, BOM lookup) and use cases arrive in
 * Phase 4c/4d.
 */
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClockService },
    { provide: TENANT_CONTEXT, useClass: ClsTenantContextService },
  ],
  exports: [CLOCK, TENANT_CONTEXT],
})
export class ProductionOrderModule {}
