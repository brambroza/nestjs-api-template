import { DomainError } from '../errors';

import { Money, sumMoney } from './money';

/**
 * Line arithmetic shared by every priced document (quotation, sales
 * order, purchase order). gross = unit × qty; discount = gross × bp;
 * net = gross − discount; tax = net × rate; total = net + tax. Every
 * rounding is half-up at the minor unit, applied per line — the Thai
 * Revenue Department accepts per-line VAT rounding as long as the
 * document total is the sum of the lines, which it is here.
 */
export class InvalidDocumentLineError extends DomainError {
  readonly code = 'DOMAIN.INVALID_DOCUMENT_LINE';
}

export const PriceSource = {
  PriceList: 'PRICE_LIST',
  Manual: 'MANUAL',
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];
export function isPriceSource(v: string): v is PriceSource {
  return (Object.values(PriceSource) as string[]).includes(v);
}

export const MAX_DOCUMENT_LINES = 500;
export const MAX_DISCOUNT_BP = 10_000;

/** A line as the application layer hands it in: already priced and taxed. */
export interface DocumentLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly description: string;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly unitPriceMinor: bigint;
  readonly priceSource: PriceSource;
  readonly priceListId: string | null;
  readonly discountBp: number;
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly taxRateBp: number;
}

export interface DocumentLineSnapshot extends DocumentLineInput {
  readonly lineNo: number;
  readonly discountMinor: bigint;
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}

export interface DocumentTotals {
  readonly subtotalMinor: bigint;
  readonly discountMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}

const isInt = (v: number): boolean => Number.isInteger(v);

export function computeDocumentLine(
  input: DocumentLineInput,
  currency: string,
  lineNo: number,
): DocumentLineSnapshot {
  const at = `line ${String(lineNo)}`;
  if (input.quantity <= 0n) {
    throw new InvalidDocumentLineError(`${at}: quantity must be > 0`);
  }
  if (input.unitPriceMinor < 0n) {
    throw new InvalidDocumentLineError(`${at}: unit price must be >= 0`);
  }
  if (
    !isInt(input.discountBp) ||
    input.discountBp < 0 ||
    input.discountBp > MAX_DISCOUNT_BP
  ) {
    throw new InvalidDocumentLineError(
      `${at}: discountBp must be an integer 0..${String(MAX_DISCOUNT_BP)}`,
    );
  }
  if (!isInt(input.taxRateBp) || input.taxRateBp < 0) {
    throw new InvalidDocumentLineError(`${at}: taxRateBp must be >= 0`);
  }
  const description = input.description.trim();
  if (description.length === 0 || description.length > 200) {
    throw new InvalidDocumentLineError(
      `${at}: description must be 1..200 characters`,
    );
  }
  const uomCode = input.uomCode.trim().toUpperCase();
  if (uomCode.length === 0) {
    throw new InvalidDocumentLineError(`${at}: uomCode is required`);
  }
  const gross = Money.of(input.unitPriceMinor, currency).multiply(
    input.quantity,
  );
  const discount = gross.percent(BigInt(input.discountBp));
  const net = gross.subtract(discount);
  const tax = net.percent(BigInt(input.taxRateBp));
  const total = net.add(tax);
  return {
    ...input,
    description,
    uomCode,
    lineNo,
    discountMinor: discount.amount,
    netMinor: net.amount,
    taxMinor: tax.amount,
    totalMinor: total.amount,
  };
}

export function computeDocumentTotals(
  lines: readonly DocumentLineSnapshot[],
  currency: string,
): DocumentTotals {
  const gross = sumMoney(
    lines.map((l) => Money.of(l.unitPriceMinor, currency).multiply(l.quantity)),
    currency,
  );
  const discount = sumMoney(
    lines.map((l) => Money.of(l.discountMinor, currency)),
    currency,
  );
  const tax = sumMoney(
    lines.map((l) => Money.of(l.taxMinor, currency)),
    currency,
  );
  return {
    subtotalMinor: gross.amount,
    discountMinor: discount.amount,
    taxMinor: tax.amount,
    totalMinor: gross.subtract(discount).add(tax).amount,
  };
}

/** Validates count + id uniqueness, numbers the lines 1..n and computes each. */
export function buildDocumentLines<T extends DocumentLineInput>(
  inputs: readonly T[],
  currency: string,
): DocumentLineSnapshot[] {
  if (inputs.length > MAX_DOCUMENT_LINES) {
    throw new InvalidDocumentLineError(
      `a document has at most ${String(MAX_DOCUMENT_LINES)} lines`,
    );
  }
  const ids = new Set<string>();
  for (const l of inputs) {
    if (ids.has(l.id))
      throw new InvalidDocumentLineError(`duplicate line id ${l.id}`);
    ids.add(l.id);
  }
  return inputs.map((l, i) => computeDocumentLine(l, currency, i + 1));
}
