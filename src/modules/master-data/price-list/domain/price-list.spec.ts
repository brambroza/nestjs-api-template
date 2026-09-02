import {
  InvalidPriceListFieldError,
  PriceList,
  PriceListLine,
  resolvePrice,
  type PriceCandidate,
  type PriceListLineSnapshot,
  type PriceListSnapshot,
} from './price-list';

const d = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

const list = (
  id: string,
  o: Partial<PriceListSnapshot> = {},
): PriceListSnapshot => ({
  id,
  tenantId: 't',
  code: id.toUpperCase(),
  name: id,
  currency: 'THB',
  customerId: null,
  validFrom: d('2026-01-01'),
  validTo: null,
  isActive: true,
  createdAt: d('2026-01-01'),
  updatedAt: d('2026-01-01'),
  ...o,
});

const line = (
  id: string,
  priceListId: string,
  price: bigint,
  o: Partial<PriceListLineSnapshot> = {},
): PriceListLineSnapshot => ({
  id,
  tenantId: 't',
  priceListId,
  itemId: 'item-1',
  uomCode: 'PCS',
  minQty: 1n,
  unitPriceSatang: price,
  createdAt: d('2026-01-01'),
  ...o,
});

describe('PriceList / PriceListLine invariants', () => {
  it('rejects validTo before validFrom', () => {
    expect(() =>
      PriceList.create({
        id: 'p',
        tenantId: 't',
        code: 'P',
        name: 'p',
        currency: 'THB',
        validFrom: d('2026-02-01'),
        validTo: d('2026-01-01'),
        now: d('2026-01-01'),
      }),
    ).toThrow(InvalidPriceListFieldError);
  });

  it('rejects minQty < 1 and negative price', () => {
    const base = {
      id: 'l',
      tenantId: 't',
      priceListId: 'p',
      itemId: 'i',
      uomCode: 'PCS',
      now: d('2026-01-01'),
    };
    expect(() =>
      PriceListLine.create({ ...base, minQty: 0n, unitPriceSatang: 1n }),
    ).toThrow(InvalidPriceListFieldError);
    expect(() =>
      PriceListLine.create({ ...base, unitPriceSatang: -1n }),
    ).toThrow(InvalidPriceListFieldError);
  });
});

describe('resolvePrice', () => {
  const general = list('general');
  const forCust = list('vip', { customerId: 'cust-1' });
  const expired = list('old', {
    validFrom: d('2025-01-01'),
    validTo: d('2025-12-31'),
  });
  const inactive = list('off', { isActive: false });

  const candidates: PriceCandidate[] = [
    { list: general, line: line('g1', 'general', 100_00n) },
    { list: general, line: line('g10', 'general', 90_00n, { minQty: 10n }) },
    { list: general, line: line('g100', 'general', 80_00n, { minQty: 100n }) },
    {
      list: general,
      line: line('gbox', 'general', 1_000_00n, { uomCode: 'BOX' }),
    },
    { list: forCust, line: line('v1', 'vip', 95_00n) },
    { list: expired, line: line('o1', 'old', 1_00n) },
    { list: inactive, line: line('x1', 'off', 1_00n) },
  ];

  const q = (o: Partial<Parameters<typeof resolvePrice>[1]> = {}) => ({
    customerId: null as string | null,
    date: d('2026-06-01'),
    quantity: 1n,
    uomCode: 'PCS',
    ...o,
  });

  it('general list, base tier', () => {
    const m = resolvePrice(candidates, q());
    expect(m).toMatchObject({
      lineId: 'g1',
      unitPriceSatang: 100_00n,
      matchedBy: 'GENERAL',
    });
  });

  it('picks the highest tier the quantity reaches', () => {
    expect(resolvePrice(candidates, q({ quantity: 10n }))?.lineId).toBe('g10');
    expect(resolvePrice(candidates, q({ quantity: 99n }))?.lineId).toBe('g10');
    expect(resolvePrice(candidates, q({ quantity: 100n }))?.lineId).toBe(
      'g100',
    );
  });

  it('customer-specific list beats general even at a lower tier', () => {
    const m = resolvePrice(
      candidates,
      q({ customerId: 'cust-1', quantity: 500n }),
    );
    expect(m).toMatchObject({ lineId: 'v1', matchedBy: 'CUSTOMER' });
  });

  it("another customer's list is invisible", () => {
    expect(resolvePrice(candidates, q({ customerId: 'cust-2' }))?.lineId).toBe(
      'g1',
    );
  });

  it('respects uom, validity window and active flag', () => {
    expect(resolvePrice(candidates, q({ uomCode: 'BOX' }))?.lineId).toBe(
      'gbox',
    );
    expect(resolvePrice(candidates, q({ uomCode: 'KG' }))).toBeNull();
    expect(resolvePrice(candidates, q({ date: d('2025-06-01') }))?.lineId).toBe(
      'o1',
    );
    expect(resolvePrice([candidates[6] as PriceCandidate], q())).toBeNull();
  });

  it('newer validFrom wins an overlap at the same scope and tier', () => {
    const older = list('older', { validFrom: d('2026-01-01') });
    const newer = list('newer', { validFrom: d('2026-03-01') });
    const m = resolvePrice(
      [
        { list: older, line: line('a', 'older', 10n) },
        { list: newer, line: line('b', 'newer', 20n) },
      ],
      q(),
    );
    expect(m?.lineId).toBe('b');
  });
});
