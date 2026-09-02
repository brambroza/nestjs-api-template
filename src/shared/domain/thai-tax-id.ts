import { DomainError } from '../errors';

export class InvalidThaiTaxIdError extends DomainError {
  readonly code = 'DOMAIN.INVALID_THAI_TAX_ID';
}

/**
 * เลขประจำตัวผู้เสียภาษี 13 หลัก. Same mod-11 check digit as the national
 * ID: weights 13..2 over the first 12 digits, check = (11 - sum % 11) % 10.
 *
 * Whitespace and dashes are stripped so "0-1055-51234-56-7" and
 * "0105551234567" normalise to the same value. Stored form is always the
 * bare 13 digits.
 */
export class ThaiTaxId {
  private constructor(readonly value: string) {}

  static of(raw: string): ThaiTaxId {
    const digits = raw.replace(/[\s-]/g, '');
    if (!/^\d{13}$/.test(digits)) {
      throw new InvalidThaiTaxIdError('Thai tax id must be exactly 13 digits');
    }
    if (!ThaiTaxId.checkDigitValid(digits)) {
      throw new InvalidThaiTaxIdError('Thai tax id check digit does not match');
    }
    return new ThaiTaxId(digits);
  }

  static tryOf(raw: string | null | undefined): ThaiTaxId | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : ThaiTaxId.of(trimmed);
  }

  private static checkDigitValid(digits: string): boolean {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(digits[i]) * (13 - i);
    }
    const check = (11 - (sum % 11)) % 10;
    return check === Number(digits[12]);
  }

  equals(other: ThaiTaxId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
