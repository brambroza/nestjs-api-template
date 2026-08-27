import { DomainError } from '../../../../shared/errors';

import type { Sku } from '../value-objects/ids';
import { Quantity } from '../value-objects/quantity';

/**
 * R4 + R5. A BomLine describes how much of one component (SKU) is needed
 * per unit of finished good, plus scrap+yield adjustments and the minimum
 * pack size to which the required quantity must be rounded up.
 *
 * All ratios are in basis points (10 000 bp = 100 %). All quantities are
 * bigint values in the base counted unit of the SKU. No float ever.
 */
export interface BomLine {
  readonly sku: Sku;
  readonly requiredPerUnit: Quantity;
  readonly scrapBasisPoints: bigint;
  readonly yieldBasisPoints: bigint;
  readonly minPack: Quantity;
}

export class InvalidBomLineError extends DomainError {
  readonly code = 'DOMAIN.INVALID_BOM_LINE';
}

const BASIS_POINT_DENOMINATOR = 10_000n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new InvalidBomLineError('yield basis points must be > 0');
  }
  if (numerator <= 0n) {
    return 0n;
  }
  return (numerator + denominator - 1n) / denominator;
}

function ceilToMinPack(value: bigint, packSize: bigint): bigint {
  if (packSize <= 0n) {
    throw new InvalidBomLineError('minPack must be > 0');
  }
  if (value === 0n) {
    return 0n;
  }
  return ceilDiv(value, packSize) * packSize;
}

/**
 * Required = ordered × perUnit × (1 + scrap) / yield, rounded up, then
 * rounded up again to the minimum pack size. All bigint arithmetic — no
 * intermediate float, no toString/parse tricks.
 */
export function computeRequired(ordered: Quantity, line: BomLine): Quantity {
  if (line.requiredPerUnit.uom !== line.minPack.uom) {
    throw new InvalidBomLineError(
      `BOM line ${line.sku}: requiredPerUnit uom (${line.requiredPerUnit.uom}) must match minPack uom (${line.minPack.uom})`,
    );
  }
  if (line.yieldBasisPoints <= 0n) {
    throw new InvalidBomLineError(
      `BOM line ${line.sku}: yield basis points must be > 0`,
    );
  }
  if (line.scrapBasisPoints < 0n) {
    throw new InvalidBomLineError(
      `BOM line ${line.sku}: scrap basis points must be >= 0`,
    );
  }

  const numerator =
    ordered.value *
    line.requiredPerUnit.value *
    (BASIS_POINT_DENOMINATOR + line.scrapBasisPoints);
  const denominator = line.yieldBasisPoints;

  const raw = ceilDiv(numerator, denominator);
  const packed = ceilToMinPack(raw, line.minPack.value);

  return Quantity.of(packed, line.minPack.uom);
}
