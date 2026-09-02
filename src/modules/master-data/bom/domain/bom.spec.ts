import { Bom, BomComponentInvalidError, InvalidBomError } from './bom';

describe('Bom aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const comp = (
    id: string,
    itemId: string,
    o: Record<string, unknown> = {},
  ) => ({
    id,
    componentItemId: itemId,
    componentSku: itemId.toUpperCase(),
    qtyPerUnit: 2n,
    qtyPerUnitUom: 'KG',
    ...o,
  });
  const base = {
    id: 'bom-1',
    tenantId: 't',
    itemId: 'fin-a',
    productSku: 'FIN-A',
    version: 1,
    now,
  };

  it('numbers lines, applies defaults, starts inactive', () => {
    const s = Bom.create({
      ...base,
      components: [comp('c1', 'raw-a'), comp('c2', 'raw-b', { minPack: 10n })],
    }).snapshot();
    expect(s.isActive).toBe(false);
    expect(s.components.map((c) => c.lineNo)).toEqual([1, 2]);
    expect(s.components[0]).toMatchObject({
      scrapBasisPoints: 0n,
      yieldBasisPoints: 10_000n,
      minPack: 1n,
      minPackUom: 'KG',
    });
    expect(s.components[1]?.minPack).toBe(10n);
  });

  it('rejects empty, self-referencing and duplicate components', () => {
    expect(() => Bom.create({ ...base, components: [] })).toThrow(
      InvalidBomError,
    );
    expect(() =>
      Bom.create({ ...base, components: [comp('c1', 'fin-a')] }),
    ).toThrow(BomComponentInvalidError);
    expect(() =>
      Bom.create({
        ...base,
        components: [comp('c1', 'raw-a'), comp('c2', 'raw-a')],
      }),
    ).toThrow(BomComponentInvalidError);
  });

  it('enforces the R5 arithmetic contract per component', () => {
    const bad = (o: Record<string, unknown>) =>
      Bom.create({ ...base, components: [comp('c1', 'raw-a', o)] });
    expect(() => bad({ qtyPerUnit: 0n })).toThrow(BomComponentInvalidError);
    expect(() => bad({ scrapBasisPoints: 10_000n })).toThrow(
      BomComponentInvalidError,
    );
    expect(() => bad({ yieldBasisPoints: 0n })).toThrow(
      BomComponentInvalidError,
    );
    expect(() => bad({ yieldBasisPoints: 10_001n })).toThrow(
      BomComponentInvalidError,
    );
    expect(() => bad({ minPack: 0n })).toThrow(BomComponentInvalidError);
    expect(() => bad({ minPackUom: 'G' })).toThrow(BomComponentInvalidError);
  });

  it('activate/deactivate are immutable and idempotent', () => {
    const b = Bom.create({ ...base, components: [comp('c1', 'raw-a')] });
    const later = new Date('2026-10-01T00:00:00.000Z');
    const on = b.activate(later);
    expect(on.snapshot().isActive).toBe(true);
    expect(on.snapshot().updatedAt).toEqual(later);
    expect(b.snapshot().isActive).toBe(false);
    expect(on.activate(later)).toBe(on);
    expect(on.deactivate(later).snapshot().isActive).toBe(false);
  });
});
