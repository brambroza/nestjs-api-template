import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface LineConfig {
  readonly channelAccessToken: string;
  readonly channelSecret: string;
  readonly apiBaseUrl: string;
}

export default registerAs<LineConfig>('line', () => {
  const env = validateEnv(process.env);
  return {
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: env.LINE_CHANNEL_SECRET,
    apiBaseUrl: env.LINE_API_BASE_URL,
  };
});
