import {
  NegativeQuantityError,
  Quantity,
  QuantityUomMismatchError,
} from './quantity';

describe('Quantity', () => {
  it('factory rejects negative values', () => {
    expect(() => Quantity.of(-1n, 'kg')).toThrow(NegativeQuantityError);
  });

  it('factory rejects empty uom', () => {
    expect(() => Quantity.of(0n, '')).toThrow(QuantityUomMismatchError);
  });

  it('add and subtract preserve uom and require matching uom', () => {
    const kg = Quantity.of(5n, 'kg');
    const kg2 = Quantity.of(3n, 'kg');
    expect(kg.add(kg2).value).toBe(8n);
    expect(kg.subtract(kg2).value).toBe(2n);
    expect(() => kg.add(Quantity.of(3n, 'g'))).toThrow(
      QuantityUomMismatchError,
    );
  });

  it('subtracting to a negative value throws via factory', () => {
    const kg = Quantity.of(1n, 'kg');
    expect(() => kg.subtract(Quantity.of(2n, 'kg'))).toThrow(
      NegativeQuantityError,
    );
  });

  it('comparisons enforce uom match', () => {
    const kg = Quantity.of(2n, 'kg');
    expect(kg.isGreaterThan(Quantity.of(1n, 'kg'))).toBe(true);
    expect(kg.isGreaterThanOrEqual(Quantity.of(2n, 'kg'))).toBe(true);
    expect(() => kg.isGreaterThan(Quantity.of(1n, 'g'))).toThrow(
      QuantityUomMismatchError,
    );
  });

  it('zero() creates a zero of that uom and isZero() detects it', () => {
    const q = Quantity.zero('pcs');
    expect(q.value).toBe(0n);
    expect(q.isZero()).toBe(true);
    expect(Quantity.of(1n, 'pcs').isZero()).toBe(false);
  });

  it('toJSON stringifies the bigint', () => {
    expect(Quantity.of(42n, 'pcs').toJSON()).toEqual({
      value: '42',
      uom: 'pcs',
    });
  });
});
