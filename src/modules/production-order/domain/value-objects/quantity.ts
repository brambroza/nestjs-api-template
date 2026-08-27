import { DomainError } from '../../../../shared/errors';

/**
 * Quantity is (value: bigint, uom: string). `value` is expressed in the
 * base counted unit of the SKU (defined in master data), so arithmetic is
 * exact. Adding two Quantities with different uom throws.
 */
export class QuantityUomMismatchError extends DomainError {
  readonly code = 'DOMAIN.QUANTITY_UOM_MISMATCH';
}

export class NegativeQuantityError extends DomainError {
  readonly code = 'DOMAIN.NEGATIVE_QUANTITY';
}

export class Quantity {
  private constructor(
    readonly value: bigint,
    readonly uom: string,
  ) {}

  static of(value: bigint, uom: string): Quantity {
    if (value < 0n) {
      throw new NegativeQuantityError(
        `Quantity cannot be negative (got ${value.toString()} ${uom})`,
      );
    }
    if (typeof uom !== 'string' || uom.length === 0) {
      throw new QuantityUomMismatchError('uom must be a non-empty string');
    }
    return new Quantity(value, uom);
  }

  static zero(uom: string): Quantity {
    return Quantity.of(0n, uom);
  }

  private sameUom(other: Quantity): void {
    if (this.uom !== other.uom) {
      throw new QuantityUomMismatchError(
        `Cannot combine ${this.uom} with ${other.uom}`,
      );
    }
  }

  add(other: Quantity): Quantity {
    this.sameUom(other);
    return Quantity.of(this.value + other.value, this.uom);
  }

  subtract(other: Quantity): Quantity {
    this.sameUom(other);
    return Quantity.of(this.value - other.value, this.uom);
  }

  isGreaterThan(other: Quantity): boolean {
    this.sameUom(other);
    return this.value > other.value;
  }

  isGreaterThanOrEqual(other: Quantity): boolean {
    this.sameUom(other);
    return this.value >= other.value;
  }

  isZero(): boolean {
    return this.value === 0n;
  }

  toJSON(): { value: string; uom: string } {
    return { value: this.value.toString(), uom: this.uom };
  }
}
