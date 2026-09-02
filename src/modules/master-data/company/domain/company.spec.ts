import { InvalidThaiTaxIdError } from '../../../../shared/domain';

import { Company, InvalidCompanyFieldError } from './company';

describe('Company aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const baseProps = {
    id: 'co-1',
    tenantId: 't-1',
    code: 'HQ',
    name: 'Demo Factory',
    now,
  };

  it('defaults legalName to name and baseCurrency to THB', () => {
    const s = Company.create(baseProps).snapshot();
    expect(s.legalName).toBe('Demo Factory');
    expect(s.baseCurrency).toBe('THB');
    expect(s.taxId).toBeNull();
    expect(s.isActive).toBe(true);
  });

  it('keeps an explicit legalName', () => {
    const s = Company.create({
      ...baseProps,
      legalName: 'Demo Factory Co., Ltd.',
    }).snapshot();
    expect(s.legalName).toBe('Demo Factory Co., Ltd.');
  });

  it('normalises a valid Thai tax id', () => {
    const s = Company.create({
      ...baseProps,
      taxId: '0-1055-51234-56-7',
    }).snapshot();
    expect(s.taxId).toBe('0105551234567');
  });

  it('rejects an invalid Thai tax id', () => {
    expect(() =>
      Company.create({ ...baseProps, taxId: '0105551234568' }),
    ).toThrow(InvalidThaiTaxIdError);
  });

  it('upper-cases and validates currency', () => {
    expect(
      Company.create({ ...baseProps, baseCurrency: 'usd' }).snapshot()
        .baseCurrency,
    ).toBe('USD');
    expect(() => Company.create({ ...baseProps, baseCurrency: 'EUR' })).toThrow(
      InvalidCompanyFieldError,
    );
  });

  it('rejects blank code', () => {
    expect(() => Company.create({ ...baseProps, code: '  ' })).toThrow(
      InvalidCompanyFieldError,
    );
  });
});
