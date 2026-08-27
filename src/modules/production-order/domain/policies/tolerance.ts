import { DomainError } from '../../../../shared/errors';

import { Quantity } from '../value-objects/quantity';

/**
 * R9: allowed over- and under-production, expressed in basis points
 * (10000 bp = 100%). Under-tolerance is what still lets us close as COMPLETED
 * (we ordered 100 pcs, produced 99, tolerance 100bp = 1% under is fine).
 * Over-tolerance is the ceiling above which reporting is rejected outright.
 */
export interface TolerancePolicy {
  readonly overBasisPoints: bigint;
  readonly underBasisPoints: bigint;
}

export class InvalidTolerancePolicyError extends DomainError {
  readonly code = 'DOMAIN.INVALID_TOLERANCE_POLICY';
}

const BASIS_POINT_DENOMINATOR = 10_000n;

export function tolerancePolicy(
  overBasisPoints: bigint,
  underBasisPoints: bigint,
): TolerancePolicy {
  if (overBasisPoints < 0n || underBasisPoints < 0n) {
    throw new InvalidTolerancePolicyError(
      'Tolerance basis points must be non-negative',
    );
  }
  return { overBasisPoints, underBasisPoints };
}

/**
 * `ordered * (10000 + overBp) / 10000`. Ceiling — reporting is rejected
 * beyond it.
 */
export function overCeiling(
  ordered: Quantity,
  policy: TolerancePolicy,
): Quantity {
  const value =
    (ordered.value * (BASIS_POINT_DENOMINATOR + policy.overBasisPoints)) /
    BASIS_POINT_DENOMINATOR;
  return Quantity.of(value, ordered.uom);
}

/**
 * Floor for completing — `ordered * (10000 − underBp) / 10000`. Reporting
 * ≥ this closes the order.
 */
export function completionFloor(
  ordered: Quantity,
  policy: TolerancePolicy,
): Quantity {
  const numerator = BASIS_POINT_DENOMINATOR - policy.underBasisPoints;
  const bounded = numerator < 0n ? 0n : numerator;
  const value = (ordered.value * bounded) / BASIS_POINT_DENOMINATOR;
  return Quantity.of(value, ordered.uom);
}
