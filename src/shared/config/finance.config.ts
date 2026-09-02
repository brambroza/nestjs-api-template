import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface FinanceConfig {
  /** Bank of Thailand API base, e.g. https://apigw1.bot.or.th/bot/public */
  readonly botApiBaseUrl: string;
  /** Empty = FX auto-sync disabled. */
  readonly botApiClientId: string;
  readonly fxSyncEnabled: boolean;
}

export default registerAs<FinanceConfig>('finance', () => {
  const env = validateEnv(process.env);
  return {
    botApiBaseUrl: env.BOT_API_BASE_URL,
    botApiClientId: env.BOT_API_CLIENT_ID,
    fxSyncEnabled: env.BOT_API_CLIENT_ID.length > 0,
  };
});
