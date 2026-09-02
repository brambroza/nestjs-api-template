import {
  computeTaxMinor,
  InvalidTaxCodeFieldError,
  PndForm,
  splitInclusiveMinor,
  TaxCode,
  TaxKind,
  VatTreatment,
} from './tax-code';

describe('TaxCode invariants', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const base = { id: 'x', tenantId: 't', now };

  it('VAT: STANDARD needs a rate, ZERO_RATED / EXEMPT must be 0, no pndForm', () => {
    const vat7 = TaxCode.create({
      ...base,
      code: 'vat7',
      name: 'VAT 7%',
      kind: TaxKind.Vat,
      rateBasisPoints: 700n,
    });
    expect(vat7.snapshot()).toMatchObject({
      code: 'VAT7',
      vatTreatment: VatTreatment.Standard,
      pndForm: null,
    });
    expect(() =>
      TaxCode.create({
        ...base,
        code: 'V0',
        name: 'x',
        kind: TaxKind.Vat,
        rateBasisPoints: 0n,
      }),
    ).toThrow(InvalidTaxCodeFieldError);
    expect(() =>
      TaxCode.create({
        ...base,
        code: 'EX',
        name: 'x',
        kind: TaxKind.Vat,
        rateBasisPoints: 700n,
        vatTreatment: VatTreatment.Exempt,
      }),
    ).toThrow(InvalidTaxCodeFieldError);
    expect(() =>
      TaxCode.create({
        ...base,
        code: 'V7',
        name: 'x',
        kind: TaxKind.Vat,
        rateBasisPoints: 700n,
        pndForm: PndForm.Pnd53,
      }),
    ).toThrow(InvalidTaxCodeFieldError);
  });

  it('WHT: needs a pndForm and a positive rate, no vatTreatment', () => {
    const wht3 = TaxCode.create({
      ...base,
      code: 'WHT3',
      name: 'Services 3%',
      kind: TaxKind.Wht,
      rateBasisPoints: 300n,
      pndForm: PndForm.Pnd53,
      whtIncomeType: 'ค่าบริการ',
    });
    expect(wht3.snapshot()).toMatchObject({
      pndForm: 'PND53',
      vatTreatment: null,
      whtIncomeType: 'ค่าบริการ',
    });
    expect(() =>
      TaxCode.create({
        ...base,
        code: 'W',
        name: 'x',
        kind: TaxKind.Wht,
        rateBasisPoints: 300n,
      }),
    ).toThrow(InvalidTaxCodeFieldError);
    expect(() =>
      TaxCode.create({
        ...base,
        code: 'W',
        name: 'x',
        kind: TaxKind.Wht,
        rateBasisPoints: 0n,
        pndForm: PndForm.Pnd3,
      }),
    ).toThrow(InvalidTaxCodeFieldError);
  });
});

describe('tax arithmetic (satang, half-up)', () => {
  it('7% of 1,000.00 = 70.00; 3% of 1,234.56 = 37.04', () => {
    expect(computeTaxMinor(100_000n, 700n)).toBe(7_000n);
    expect(computeTaxMinor(123_456n, 300n)).toBe(3_704n); // 3703.68 -> 3704
  });

  it('splits an inclusive 107.00 into 100.00 + 7.00 and always sums back', () => {
    expect(splitInclusiveMinor(10_700n, 700n)).toEqual({
      baseMinor: 10_000n,
      taxMinor: 700n,
    });
    const { baseMinor, taxMinor } = splitInclusiveMinor(99_999n, 700n);
    expect(baseMinor + taxMinor).toBe(99_999n);
    expect(baseMinor).toBe(93_457n); // 99999/1.07 = 93457.0093
  });
});
