import { InvalidThaiTaxIdError, ThaiTaxId } from './thai-tax-id';

describe('ThaiTaxId', () => {
  it('accepts a valid 13-digit id', () => {
    expect(ThaiTaxId.of('0105551234567').value).toBe('0105551234567');
    expect(ThaiTaxId.of('0105557654321').value).toBe('0105557654321');
  });

  it('strips dashes and whitespace', () => {
    expect(ThaiTaxId.of('0-1055-51234-56-7').value).toBe('0105551234567');
    expect(ThaiTaxId.of(' 0105551234567 ').value).toBe('0105551234567');
  });

  it('rejects wrong check digit', () => {
    expect(() => ThaiTaxId.of('0105551234568')).toThrow(InvalidThaiTaxIdError);
  });

  it('rejects wrong length or non-digits', () => {
    expect(() => ThaiTaxId.of('123')).toThrow(InvalidThaiTaxIdError);
    expect(() => ThaiTaxId.of('01055512345678')).toThrow(InvalidThaiTaxIdError);
    expect(() => ThaiTaxId.of('010555123456X')).toThrow(InvalidThaiTaxIdError);
  });

  it('tryOf returns null for blank/nullish', () => {
    expect(ThaiTaxId.tryOf(null)).toBeNull();
    expect(ThaiTaxId.tryOf(undefined)).toBeNull();
    expect(ThaiTaxId.tryOf('   ')).toBeNull();
    expect(ThaiTaxId.tryOf('0105551234567')?.value).toBe('0105551234567');
  });
});
