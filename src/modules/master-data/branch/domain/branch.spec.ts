import { Branch, InvalidBranchFieldError } from './branch';

describe('Branch aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const baseProps = {
    id: 'br-1',
    tenantId: 't-1',
    companyId: 'co-1',
    code: 'HQ',
    name: 'Head Office',
    now,
  };

  it('defaults to head office (00000) when branchNumber omitted', () => {
    const s = Branch.create(baseProps).snapshot();
    expect(s.branchNumber).toBe('00000');
    expect(s.isHeadOffice).toBe(true);
  });

  it('derives isHeadOffice=false for a numbered branch', () => {
    const s = Branch.create({ ...baseProps, branchNumber: '00001' }).snapshot();
    expect(s.branchNumber).toBe('00001');
    expect(s.isHeadOffice).toBe(false);
  });

  it('rejects a branchNumber that is not 5 digits', () => {
    expect(() => Branch.create({ ...baseProps, branchNumber: '1' })).toThrow(
      InvalidBranchFieldError,
    );
    expect(() =>
      Branch.create({ ...baseProps, branchNumber: 'ABCDE' }),
    ).toThrow(InvalidBranchFieldError);
  });

  it('normalises address: blanks become null, values trimmed', () => {
    const s = Branch.create({
      ...baseProps,
      address: {
        line1: '  123 Sukhumvit Rd ',
        line2: '   ',
        province: 'Bangkok',
        postalCode: '10110',
      },
    }).snapshot();
    expect(s.address).toEqual({
      line1: '123 Sukhumvit Rd',
      line2: null,
      subDistrict: null,
      district: null,
      province: 'Bangkok',
      postalCode: '10110',
    });
  });

  it('rejects a non-5-digit postal code', () => {
    expect(() =>
      Branch.create({ ...baseProps, address: { postalCode: '1011' } }),
    ).toThrow(InvalidBranchFieldError);
  });
});
