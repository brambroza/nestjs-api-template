import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface AuthConfig {
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtAccessTtl: string;
  /** Dev/test convenience — must be false in prod. */
  readonly allowHeaderStub: boolean;
}

export default registerAs<AuthConfig>('auth', () => {
  const env = validateEnv(process.env);
  const allowHeaderStub =
    env.AUTH_ALLOW_HEADER_STUB && env.APP_ENV !== 'production';
  return {
    jwtSecret: env.JWT_SECRET,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
    jwtAccessTtl: env.JWT_ACCESS_TTL,
    allowHeaderStub,
  };
});
