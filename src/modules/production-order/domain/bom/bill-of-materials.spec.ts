import { computeRequired, InvalidBomLineError } from './bill-of-materials';
import { Sku } from '../value-objects/ids';
import { Quantity } from '../value-objects/quantity';

/**
 * R5. Every case here uses bigint end-to-end — if a Number ever crept in
 * the equality checks would flip. The ceiling formula is:
 *   raw   = ceil(ordered × perUnit × (10000 + scrapBp) / yieldBp)
 *   packed = ceil(raw / minPack) × minPack
 */

const sku = Sku.of('SKU-A');

const line = (
  overrides: Partial<{
    perUnit: bigint;
    scrapBp: bigint;
    yieldBp: bigint;
    minPack: bigint;
    uom: string;
  }> = {},
): Parameters<typeof computeRequired>[1] => ({
  sku,
  requiredPerUnit: Quantity.of(overrides.perUnit ?? 1n, overrides.uom ?? 'kg'),
  scrapBasisPoints: overrides.scrapBp ?? 0n,
  yieldBasisPoints: overrides.yieldBp ?? 10_000n,
  minPack: Quantity.of(overrides.minPack ?? 1n, overrides.uom ?? 'kg'),
});

describe('bill of materials — computeRequired (R5)', () => {
  it('with zero scrap and 100% yield returns ordered × perUnit exactly', () => {
    const result = computeRequired(
      Quantity.of(10n, 'pcs'),
      line({ perUnit: 5n }),
    );
    expect(result.value).toBe(50n);
    expect(result.uom).toBe('kg');
  });

  it('with 5% scrap and 95% yield rounds up to the next minPack', () => {
    // ordered=100, perUnit=1, scrap=500bp, yield=9500bp
    // raw = ceil(100 * 1 * 10500 / 9500) = ceil(1_050_000/9500) = ceil(110.526) = 111
    // minPack=10 -> 120
    const result = computeRequired(
      Quantity.of(100n, 'pcs'),
      line({ perUnit: 1n, scrapBp: 500n, yieldBp: 9_500n, minPack: 10n }),
    );
    expect(result.value).toBe(120n);
  });

  it('yields exact when raw already divides minPack', () => {
    // ordered=10, perUnit=5, scrap=0, yield=10000, raw=50, minPack=5 -> 50
    const result = computeRequired(
      Quantity.of(10n, 'pcs'),
      line({ perUnit: 5n, minPack: 5n }),
    );
    expect(result.value).toBe(50n);
  });

  it('zero ordered returns zero required', () => {
    const result = computeRequired(
      Quantity.of(0n, 'pcs'),
      line({ perUnit: 5n }),
    );
    expect(result.value).toBe(0n);
  });

  it('throws when yield basis points is 0', () => {
    expect(() =>
      computeRequired(Quantity.of(1n, 'pcs'), line({ yieldBp: 0n })),
    ).toThrow(InvalidBomLineError);
  });

  it('throws when scrap basis points is negative', () => {
    expect(() =>
      computeRequired(Quantity.of(1n, 'pcs'), line({ scrapBp: -1n })),
    ).toThrow(InvalidBomLineError);
  });

  it('throws when minPack uom differs from perUnit uom', () => {
    expect(() =>
      computeRequired(Quantity.of(1n, 'pcs'), {
        sku,
        requiredPerUnit: Quantity.of(1n, 'kg'),
        scrapBasisPoints: 0n,
        yieldBasisPoints: 10_000n,
        minPack: Quantity.of(1n, 'g'),
      }),
    ).toThrow(InvalidBomLineError);
  });

  it('never introduces a float — output value is exactly a bigint multiple of minPack', () => {
    const result = computeRequired(
      Quantity.of(37n, 'pcs'),
      line({ perUnit: 3n, scrapBp: 250n, yieldBp: 9_800n, minPack: 25n }),
    );
    expect(typeof result.value).toBe('bigint');
    expect(result.value % 25n).toBe(0n);
  });
});
