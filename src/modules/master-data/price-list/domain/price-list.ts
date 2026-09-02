import { DomainError } from '../../../../shared/errors';

export const CURRENCIES = ['THB', 'USD', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];
export function isCurrency(v: string): v is Currency {
  return (CURRENCIES as readonly string[]).includes(v);
}

export class PriceListNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.PRICE_LIST_NOT_FOUND';
  constructor(readonly priceListId: string) {
    super(`Price list ${priceListId} not found`);
  }
}

export class DuplicatePriceListCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_PRICE_LIST_CODE';
  constructor(readonly priceListCode: string) {
    super(`Price list code "${priceListCode}" already exists in this tenant`);
  }
}

export class DuplicatePriceListLineError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_PRICE_LIST_LINE';
  constructor(
    readonly itemId: string,
    readonly uomCode: string,
    readonly minQty: bigint,
  ) {
    super(
      `Price list already has a line for item ${itemId} / ${uomCode} / minQty ${minQty.toString()}`,
    );
  }
}

export class InvalidPriceListFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_PRICE_LIST_FIELD';
}

/** Item / customer / uom referenced by a price list does not exist in this tenant. */
export class PriceListRefInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.PRICE_LIST_REF_INVALID';
}

export class NoPriceFoundError extends DomainError {
  readonly code = 'MASTER_DATA.NO_PRICE_FOUND';
  constructor(
    readonly itemId: string,
    readonly customerId: string | null,
    readonly uomCode: string,
    readonly date: Date,
  ) {
    super(
      `No price for item ${itemId} (${uomCode}) on ${date.toISOString().slice(0, 10)}` +
        (customerId ? ` for customer ${customerId}` : ''),
    );
  }
}

export interface PriceListSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly currency: Currency;
  /** null = general list applying to every customer. */
  readonly customerId: string | null;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePriceListProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly currency: Currency;
  readonly customerId?: string | null;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
  readonly now: Date;
}

export class PriceList {
  private constructor(private readonly s: PriceListSnapshot) {}

  static create(props: CreatePriceListProps): PriceList {
    const code = props.code.trim();
    if (
      code.length === 0 ||
      code.length > 32 ||
      !/^[A-Za-z0-9._-]+$/.test(code)
    ) {
      throw new InvalidPriceListFieldError(
        'code must be 1-32 chars of letters, digits, dot, underscore, dash',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidPriceListFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const validTo = props.validTo ?? null;
    if (validTo !== null && validTo.getTime() < props.validFrom.getTime()) {
      throw new InvalidPriceListFieldError(
        'validTo must not be before validFrom',
      );
    }
    return new PriceList({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      currency: props.currency,
      customerId: (props.customerId ?? '').trim() || null,
      validFrom: props.validFrom,
      validTo,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: PriceListSnapshot): PriceList {
    return new PriceList(s);
  }

  isValidOn(date: Date): boolean {
    return isValidOn(this.s, date);
  }

  snapshot(): PriceListSnapshot {
    return this.s;
  }
}

export function isValidOn(list: PriceListSnapshot, date: Date): boolean {
  const t = date.getTime();
  return (
    list.isActive &&
    list.validFrom.getTime() <= t &&
    (list.validTo === null || t <= list.validTo.getTime())
  );
}

export interface PriceListLineSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly priceListId: string;
  readonly itemId: string;
  readonly uomCode: string;
  /** Tier floor: the price applies from this quantity upward. */
  readonly minQty: bigint;
  readonly unitPriceSatang: bigint;
  readonly createdAt: Date;
}

export interface CreatePriceListLineProps {
  readonly id: string;
  readonly tenantId: string;
  readonly priceListId: string;
  readonly itemId: string;
  readonly uomCode: string;
  readonly minQty?: bigint;
  readonly unitPriceSatang: bigint;
  readonly now: Date;
}

export class PriceListLine {
  private constructor(private readonly s: PriceListLineSnapshot) {}

  static create(props: CreatePriceListLineProps): PriceListLine {
    const uomCode = props.uomCode.trim();
    if (uomCode.length === 0 || uomCode.length > 16) {
      throw new InvalidPriceListFieldError('uomCode must be 1-16 characters');
    }
    const minQty = props.minQty ?? 1n;
    if (minQty < 1n) {
      throw new InvalidPriceListFieldError('minQty must be >= 1');
    }
    if (props.unitPriceSatang < 0n) {
      throw new InvalidPriceListFieldError(
        'unitPriceSatang must not be negative',
      );
    }
    return new PriceListLine({
      id: props.id,
      tenantId: props.tenantId,
      priceListId: props.priceListId,
      itemId: props.itemId,
      uomCode,
      minQty,
      unitPriceSatang: props.unitPriceSatang,
      createdAt: props.now,
    });
  }

  static fromSnapshot(s: PriceListLineSnapshot): PriceListLine {
    return new PriceListLine(s);
  }

  snapshot(): PriceListLineSnapshot {
    return this.s;
  }
}

// ---- resolution ------------------------------------------------------------

export interface PriceCandidate {
  readonly list: PriceListSnapshot;
  readonly line: PriceListLineSnapshot;
}

export interface PriceQuery {
  readonly customerId: string | null;
  readonly date: Date;
  readonly quantity: bigint;
  readonly uomCode: string;
}

export interface PriceMatch {
  readonly unitPriceSatang: bigint;
  readonly currency: Currency;
  readonly priceListId: string;
  readonly priceListCode: string;
  readonly lineId: string;
  readonly minQty: bigint;
  readonly matchedBy: 'CUSTOMER' | 'GENERAL';
}

/**
 * Picks the applicable price. Deterministic ranking:
 *   1. customer-specific list beats general
 *   2. highest quantity tier (minQty) that the quantity reaches
 *   3. most recent validFrom (a newer list overrides an older overlap)
 *   4. list code, then line id — a stable tiebreak so the same query
 *      always returns the same line
 * Pure; the use case supplies candidates already narrowed by item.
 */
export function resolvePrice(
  candidates: readonly PriceCandidate[],
  q: PriceQuery,
): PriceMatch | null {
  const eligible = candidates.filter(
    ({ list, line }) =>
      isValidOn(list, q.date) &&
      (list.customerId === null || list.customerId === q.customerId) &&
      line.uomCode === q.uomCode &&
      line.minQty <= q.quantity,
  );
  if (eligible.length === 0) return null;

  const rank = (c: PriceCandidate): number => (c.list.customerId ? 0 : 1);
  eligible.sort((a, b) => {
    const byScope = rank(a) - rank(b);
    if (byScope !== 0) return byScope;
    if (a.line.minQty !== b.line.minQty)
      return a.line.minQty > b.line.minQty ? -1 : 1;
    const byFrom = b.list.validFrom.getTime() - a.list.validFrom.getTime();
    if (byFrom !== 0) return byFrom;
    return (
      a.list.code.localeCompare(b.list.code) ||
      a.line.id.localeCompare(b.line.id)
    );
  });
  const best = eligible[0];
  if (!best) return null;
  return {
    unitPriceSatang: best.line.unitPriceSatang,
    currency: best.list.currency,
    priceListId: best.list.id,
    priceListCode: best.list.code,
    lineId: best.line.id,
    minQty: best.line.minQty,
    matchedBy: best.list.customerId ? 'CUSTOMER' : 'GENERAL',
  };
}
