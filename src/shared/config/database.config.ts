import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface DatabaseConfig {
  readonly url: string;
}

export default registerAs<DatabaseConfig>('database', () => {
  const env = validateEnv(process.env);
  return { url: env.DATABASE_URL };
});
