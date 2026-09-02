import { DomainError } from '../errors';

export class InvalidThaiAddressError extends DomainError {
  readonly code = 'DOMAIN.INVALID_ADDRESS';
}

/**
 * Thai postal address shape shared by every aggregate that carries one
 * (branch, partner address, later: delivery notes). Field names follow
 * the Revenue Department e-Tax Invoice schema so the mapping there is
 * 1:1: ตำบล/แขวง = subDistrict, อำเภอ/เขต = district, จังหวัด = province.
 */
export interface ThaiAddressFields {
  readonly line1: string | null;
  readonly line2: string | null;
  readonly subDistrict: string | null;
  readonly district: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
}

export type ThaiAddressInput = Partial<
  Record<keyof ThaiAddressFields, string | null | undefined>
>;

export interface NormaliseOptions {
  /** Reject when line1 is blank — a mailing address must have one. */
  readonly requireLine1?: boolean;
}

const LIMITS: Readonly<Record<keyof ThaiAddressFields, number>> = {
  line1: 200,
  line2: 200,
  subDistrict: 100,
  district: 100,
  province: 100,
  postalCode: 10,
};

export function normaliseThaiAddress(
  input: ThaiAddressInput | null,
  opts: NormaliseOptions = {},
): ThaiAddressFields {
  const clean = (key: keyof ThaiAddressFields): string | null => {
    const t = (input?.[key] ?? '').trim();
    if (t.length === 0) return null;
    if (t.length > LIMITS[key]) {
      throw new InvalidThaiAddressError(
        `${key} exceeds ${String(LIMITS[key])} characters`,
      );
    }
    return t;
  };
  const out: ThaiAddressFields = {
    line1: clean('line1'),
    line2: clean('line2'),
    subDistrict: clean('subDistrict'),
    district: clean('district'),
    province: clean('province'),
    postalCode: clean('postalCode'),
  };
  if (opts.requireLine1 && out.line1 === null) {
    throw new InvalidThaiAddressError('line1 is required');
  }
  if (out.postalCode !== null && !/^\d{5}$/.test(out.postalCode)) {
    throw new InvalidThaiAddressError('postalCode must be 5 digits');
  }
  return out;
}

export const EMPTY_THAI_ADDRESS: ThaiAddressFields = Object.freeze({
  line1: null,
  line2: null,
  subDistrict: null,
  district: null,
  province: null,
  postalCode: null,
});
