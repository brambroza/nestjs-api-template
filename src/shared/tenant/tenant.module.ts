import { Global, Module } from '@nestjs/common';

import { ClsTenantContextService } from './cls-tenant-context.service';
import { TENANT_CONTEXT } from './tenant-context';

/**
 * @Global so any feature module can inject TENANT_CONTEXT without
 * importing this. AppClsModule is already global too, so the CLS
 * service resolves without imports here.
 */
@Global()
@Module({
  providers: [
    ClsTenantContextService,
    { provide: TENANT_CONTEXT, useExisting: ClsTenantContextService },
  ],
  exports: [TENANT_CONTEXT, ClsTenantContextService],
})
export class TenantContextModule {}
