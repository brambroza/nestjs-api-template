import { Global, Module } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';
import { AbilityFactory } from './policies/ability.factory';
import { PoliciesGuard } from './policies/policies.guard';

@Global()
@Module({
  providers: [JwtAuthGuard, AbilityFactory, PoliciesGuard],
  exports: [JwtAuthGuard, AbilityFactory, PoliciesGuard],
})
export class AuthModule {}
