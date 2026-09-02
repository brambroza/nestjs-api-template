import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface LineConfig {
  readonly channelAccessToken: string;
  readonly channelSecret: string;
  readonly apiBaseUrl: string;
  readonly recipientByTenant: Readonly<Record<string, string>>;
}

function parseRecipientMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (raw.length === 0) return map;
  for (const entry of raw.split(',')) {
    const [tenant, recipient] = entry.split('=').map((s) => s.trim());
    if (!tenant || !recipient) {
      throw new Error(
        `LINE_RECIPIENT_MAP entry "${entry}" must be "tenantId=recipient"`,
      );
    }
    map[tenant] = recipient;
  }
  return map;
}

export default registerAs<LineConfig>('line', () => {
  const env = validateEnv(process.env);
  return {
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: env.LINE_CHANNEL_SECRET,
    apiBaseUrl: env.LINE_API_BASE_URL,
    recipientByTenant: parseRecipientMap(env.LINE_RECIPIENT_MAP),
  };
});
