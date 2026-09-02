import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { AuthConfig } from '../config/auth.config';

import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AbilityFactory } from './policies/ability.factory';
import { PoliciesGuard } from './policies/policies.guard';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return {
          secret: auth.jwtSecret,
          signOptions: {
            // ms-library string like "15m" / "24h" / number of seconds.
            // Cast avoids depending on ms's StringValue type directly.
            expiresIn: auth.jwtAccessTtl as unknown as number,
            issuer: auth.jwtIssuer,
            audience: auth.jwtAudience,
            algorithm: 'HS256' as const,
          },
        };
      },
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, AbilityFactory, PoliciesGuard],
  exports: [JwtAuthGuard, AbilityFactory, PoliciesGuard, JwtModule],
})
export class AuthModule {}
