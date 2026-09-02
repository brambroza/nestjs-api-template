import { InvalidPromptPayError } from './errors';

/**
 * Thai PromptPay EMVCo payload (T-334). Renders the string a QR
 * library encodes; the API returns the payload, the client draws it.
 *   00 payload format, 01 point of initiation (11 static / 12 dynamic),
 *   29 merchant account (00 AID, 01 mobile / 02 national id or tax id /
 *   03 e-wallet), 53 currency 764, 54 amount, 58 TH, 63 CRC-16/CCITT-FALSE.
 */
export const PromptPayProxyType = {
  Mobile: 'MOBILE',
  NationalId: 'NATIONAL_ID',
  EWallet: 'EWALLET',
} as const;
export type PromptPayProxyType =
  (typeof PromptPayProxyType)[keyof typeof PromptPayProxyType];

const AID = 'A000000677010111';

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Classifies a raw proxy: 10-digit mobile, 13-digit id / tax id, 15-digit e-wallet. */
export function classifyProxy(raw: string): {
  readonly type: PromptPayProxyType;
  readonly value: string;
} {
  const digits = raw.replace(/[^0-9]/g, '');
  if (/^0\d{9}$/.test(digits))
    return { type: PromptPayProxyType.Mobile, value: `0066${digits.slice(1)}` };
  if (/^\d{13}$/.test(digits))
    return { type: PromptPayProxyType.NationalId, value: digits };
  if (/^\d{15}$/.test(digits))
    return { type: PromptPayProxyType.EWallet, value: digits };
  throw new InvalidPromptPayError(
    `"${raw}" is not a mobile number, national/tax id or e-wallet id`,
  );
}

export function buildPromptPayPayload(args: {
  readonly proxy: string;
  /** Minor units (satang); null = the payer types the amount. */
  readonly amountMinor: bigint | null;
}): string {
  const { type, value } = classifyProxy(args.proxy);
  const subTag =
    type === PromptPayProxyType.Mobile
      ? '01'
      : type === PromptPayProxyType.NationalId
        ? '02'
        : '03';
  const merchant = tlv('00', AID) + tlv(subTag, value);
  const dynamic = args.amountMinor !== null;
  if (dynamic && args.amountMinor <= 0n)
    throw new InvalidPromptPayError('amount must be > 0');
  let body =
    tlv('00', '01') +
    tlv('01', dynamic ? '12' : '11') +
    tlv('29', merchant) +
    tlv('53', '764');
  if (dynamic) {
    const minor = args.amountMinor;
    const baht = (minor / 100n).toString();
    const satang = (minor % 100n).toString().padStart(2, '0');
    body += tlv('54', `${baht}.${satang}`);
  }
  body += tlv('58', 'TH');
  const withCrcTag = `${body}6304`;
  return `${withCrcTag}${crc16ccitt(withCrcTag)}`;
}
