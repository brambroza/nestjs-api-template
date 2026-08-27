import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface RedisConfig {
  readonly url: string;
}

export default registerAs<RedisConfig>('redis', () => {
  const env = validateEnv(process.env);
  return { url: env.REDIS_URL };
});
