import { InvalidThaiAddressError, normaliseThaiAddress } from './thai-address';

describe('normaliseThaiAddress', () => {
  it('trims values and maps blanks to null', () => {
    expect(
      normaliseThaiAddress({
        line1: '  123 Sukhumvit Rd ',
        line2: '   ',
        province: 'Bangkok',
        postalCode: '10110',
      }),
    ).toEqual({
      line1: '123 Sukhumvit Rd',
      line2: null,
      subDistrict: null,
      district: null,
      province: 'Bangkok',
      postalCode: '10110',
    });
  });

  it('returns all-null for null input', () => {
    expect(normaliseThaiAddress(null)).toEqual({
      line1: null,
      line2: null,
      subDistrict: null,
      district: null,
      province: null,
      postalCode: null,
    });
  });

  it('rejects a non-5-digit postal code', () => {
    expect(() => normaliseThaiAddress({ postalCode: '1011' })).toThrow(
      InvalidThaiAddressError,
    );
    expect(() => normaliseThaiAddress({ postalCode: '1011A' })).toThrow(
      InvalidThaiAddressError,
    );
  });

  it('enforces requireLine1', () => {
    expect(() =>
      normaliseThaiAddress({ province: 'Bangkok' }, { requireLine1: true }),
    ).toThrow(InvalidThaiAddressError);
  });

  it('rejects over-long fields', () => {
    expect(() => normaliseThaiAddress({ line1: 'x'.repeat(201) })).toThrow(
      InvalidThaiAddressError,
    );
  });
});
