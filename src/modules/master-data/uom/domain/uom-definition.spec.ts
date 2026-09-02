import { InvalidUomFieldError, UomDefinition } from './uom-definition';

describe('UomDefinition aggregate', () => {
  const baseProps = {
    id: 'u-1',
    tenantId: 't-1',
    code: 'BOX',
    name: 'Box of 12',
    baseUomCode: 'PCS',
    conversionRatio: 12n,
  };

  it('creates a derived unit', () => {
    const u = UomDefinition.create(baseProps);
    expect(u.snapshot().baseUomCode).toBe('PCS');
    expect(u.snapshot().conversionRatio).toBe(12n);
  });

  it('creates a base unit with ratio 1', () => {
    const u = UomDefinition.create({
      ...baseProps,
      code: 'PCS',
      baseUomCode: null,
      conversionRatio: 1n,
    });
    expect(u.snapshot().baseUomCode).toBeNull();
    expect(u.snapshot().conversionRatio).toBe(1n);
  });

  it('rejects base unit with non-1 ratio', () => {
    expect(() =>
      UomDefinition.create({
        ...baseProps,
        code: 'PCS',
        baseUomCode: null,
        conversionRatio: 2n,
      }),
    ).toThrow(InvalidUomFieldError);
  });

  it('rejects non-positive ratio', () => {
    expect(() =>
      UomDefinition.create({ ...baseProps, conversionRatio: 0n }),
    ).toThrow(InvalidUomFieldError);
    expect(() =>
      UomDefinition.create({ ...baseProps, conversionRatio: -1n }),
    ).toThrow(InvalidUomFieldError);
  });

  it('rejects self-referencing base', () => {
    expect(() =>
      UomDefinition.create({
        ...baseProps,
        code: 'BOX',
        baseUomCode: 'BOX',
      }),
    ).toThrow(InvalidUomFieldError);
  });

  it('rejects invalid charset', () => {
    expect(() =>
      UomDefinition.create({ ...baseProps, code: 'BOX 12' }),
    ).toThrow(InvalidUomFieldError);
  });
});
