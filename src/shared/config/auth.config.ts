import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface AuthConfig {
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
}

export default registerAs<AuthConfig>('auth', () => {
  const env = validateEnv(process.env);
  return {
    jwtSecret: env.JWT_SECRET,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
  };
});
