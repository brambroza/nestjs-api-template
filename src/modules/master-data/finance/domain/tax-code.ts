import { DomainError } from '../../../../shared/errors';

import { roundDiv } from './currency';

export const TaxKind = { Vat: 'VAT', Wht: 'WHT' } as const;
export type TaxKind = (typeof TaxKind)[keyof typeof TaxKind];
export function isTaxKind(v: string): v is TaxKind {
  return v === TaxKind.Vat || v === TaxKind.Wht;
}

/**
 * STANDARD  — 7 % output/input VAT.
 * ZERO_RATED — 0 % (exports, ภพ.30 still reports the base).
 * EXEMPT    — ยกเว้น: no VAT charged and no input credit.
 */
export const VatTreatment = {
  Standard: 'STANDARD',
  ZeroRated: 'ZERO_RATED',
  Exempt: 'EXEMPT',
} as const;
export type VatTreatment = (typeof VatTreatment)[keyof typeof VatTreatment];
export function isVatTreatment(v: string): v is VatTreatment {
  return (Object.values(VatTreatment) as readonly string[]).includes(v);
}

/** Withholding-tax return the certificate is filed under. */
export const PndForm = { Pnd3: 'PND3', Pnd53: 'PND53' } as const;
export type PndForm = (typeof PndForm)[keyof typeof PndForm];
export function isPndForm(v: string): v is PndForm {
  return v === PndForm.Pnd3 || v === PndForm.Pnd53;
}

export const BASIS_POINTS = 10_000n;

export class TaxCodeNotFoundError extends DomainError {
  readonly code = 'FINANCE.TAX_CODE_NOT_FOUND';
  constructor(readonly taxCodeId: string) {
    super(`Tax code ${taxCodeId} not found`);
  }
}
export class DuplicateTaxCodeError extends DomainError {
  readonly code = 'FINANCE.DUPLICATE_TAX_CODE';
  constructor(readonly taxCode: string) {
    super(`Tax code "${taxCode}" already exists in this tenant`);
  }
}
export class DefaultTaxCodeExistsError extends DomainError {
  readonly code = 'FINANCE.DEFAULT_TAX_CODE_EXISTS';
  constructor(
    readonly kind: TaxKind,
    readonly existingCode: string,
  ) {
    super(`${kind} already has a default tax code (${existingCode})`);
  }
}
export class NoTaxCodeForKindError extends DomainError {
  readonly code = 'FINANCE.NO_TAX_CODE_FOR_KIND';
  constructor(readonly kind: TaxKind) {
    super(`No default ${kind} tax code is configured for this tenant`);
  }
}
export class InvalidTaxCodeFieldError extends DomainError {
  readonly code = 'FINANCE.INVALID_TAX_CODE_FIELD';
}

export interface TaxCodeSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly kind: TaxKind;
  readonly rateBasisPoints: bigint;
  readonly vatTreatment: VatTreatment | null;
  readonly pndForm: PndForm | null;
  readonly whtIncomeType: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateTaxCodeProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly kind: TaxKind;
  readonly rateBasisPoints: bigint;
  readonly vatTreatment?: VatTreatment | null;
  readonly pndForm?: PndForm | null;
  readonly whtIncomeType?: string | null;
  readonly isDefault?: boolean;
  readonly now: Date;
}

export class TaxCode {
  private constructor(private readonly s: TaxCodeSnapshot) {}

  static create(props: CreateTaxCodeProps): TaxCode {
    const code = props.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,16}$/.test(code)) {
      throw new InvalidTaxCodeFieldError(
        'code must be 1-16 chars of letters, digits, underscore, dash',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new InvalidTaxCodeFieldError('name must be 1-100 characters');
    }
    const rate = props.rateBasisPoints;
    if (rate < 0n || rate > BASIS_POINTS) {
      throw new InvalidTaxCodeFieldError(
        'rateBasisPoints must be in [0, 10000]',
      );
    }

    let vatTreatment: VatTreatment | null = null;
    let pndForm: PndForm | null = null;
    let whtIncomeType: string | null = null;

    if (props.kind === TaxKind.Vat) {
      vatTreatment = props.vatTreatment ?? VatTreatment.Standard;
      if (vatTreatment === VatTreatment.Standard && rate === 0n) {
        throw new InvalidTaxCodeFieldError(
          'STANDARD VAT must have a positive rate',
        );
      }
      if (vatTreatment !== VatTreatment.Standard && rate !== 0n) {
        throw new InvalidTaxCodeFieldError(
          `${vatTreatment} VAT must have rateBasisPoints = 0`,
        );
      }
      if (props.pndForm) {
        throw new InvalidTaxCodeFieldError('pndForm applies to WHT codes only');
      }
    } else {
      if (!props.pndForm) {
        throw new InvalidTaxCodeFieldError(
          'WHT codes must name a pndForm (PND3 | PND53)',
        );
      }
      if (rate === 0n) {
        throw new InvalidTaxCodeFieldError('WHT must have a positive rate');
      }
      pndForm = props.pndForm;
      whtIncomeType = (props.whtIncomeType ?? '').trim() || null;
      if (whtIncomeType !== null && whtIncomeType.length > 100) {
        throw new InvalidTaxCodeFieldError(
          'whtIncomeType must be <= 100 characters',
        );
      }
      if (props.vatTreatment) {
        throw new InvalidTaxCodeFieldError(
          'vatTreatment applies to VAT codes only',
        );
      }
    }

    return new TaxCode({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      kind: props.kind,
      rateBasisPoints: rate,
      vatTreatment,
      pndForm,
      whtIncomeType,
      isDefault: props.isDefault ?? false,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: TaxCodeSnapshot): TaxCode {
    return new TaxCode(s);
  }

  snapshot(): TaxCodeSnapshot {
    return this.s;
  }
}

export interface ItemTaxOverrideSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly kind: TaxKind;
  readonly taxCodeId: string;
  readonly reason: string | null;
  readonly createdAt: Date;
}

// ---- arithmetic ----------------------------------------------------------

/** Tax on an exclusive base, rounded half-up to the minor unit (satang). */
export function computeTaxMinor(
  baseMinor: bigint,
  rateBasisPoints: bigint,
): bigint {
  return roundDiv(baseMinor * rateBasisPoints, BASIS_POINTS);
}

/**
 * Splits a VAT-inclusive gross into base + VAT. The base is what gets
 * rounded; VAT is the exact remainder so base + vat == gross always.
 */
export function splitInclusiveMinor(
  grossMinor: bigint,
  rateBasisPoints: bigint,
): { readonly baseMinor: bigint; readonly taxMinor: bigint } {
  const baseMinor = roundDiv(
    grossMinor * BASIS_POINTS,
    BASIS_POINTS + rateBasisPoints,
  );
  return { baseMinor, taxMinor: grossMinor - baseMinor };
}
