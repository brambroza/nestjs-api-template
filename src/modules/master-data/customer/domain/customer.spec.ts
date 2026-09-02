import {
  Customer,
  InvalidCustomerFieldError,
  type CustomerSnapshot,
} from './customer';

describe('Customer aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const baseProps = {
    id: 'cust-1',
    tenantId: 'tenant-1',
    code: 'CUST-001',
    name: 'Acme Co., Ltd.',
    now,
  };

  it('creates with defaults', () => {
    const c = Customer.create(baseProps);
    const s = c.snapshot();
    expect(s.code).toBe('CUST-001');
    expect(s.name).toBe('Acme Co., Ltd.');
    expect(s.taxId).toBeNull();
    expect(s.creditLimitSatang).toBe(0n);
    expect(s.paymentTermsDays).toBe(0);
    expect(s.isActive).toBe(true);
    expect(s.createdAt).toEqual(now);
    expect(s.updatedAt).toEqual(now);
  });

  it('trims fields', () => {
    const c = Customer.create({
      ...baseProps,
      code: '  CUST-001  ',
      name: '  Acme  ',
      taxId: '  0105551234567  ',
    });
    expect(c.snapshot().code).toBe('CUST-001');
    expect(c.snapshot().name).toBe('Acme');
    expect(c.snapshot().taxId).toBe('0105551234567');
  });

  it('rejects blank code', () => {
    expect(() => Customer.create({ ...baseProps, code: '   ' })).toThrow(
      InvalidCustomerFieldError,
    );
  });

  it('rejects code exceeding 32 chars', () => {
    expect(() =>
      Customer.create({ ...baseProps, code: 'X'.repeat(33) }),
    ).toThrow(InvalidCustomerFieldError);
  });

  it('rejects negative credit limit', () => {
    expect(() =>
      Customer.create({ ...baseProps, creditLimitSatang: -1n }),
    ).toThrow(InvalidCustomerFieldError);
  });

  it('rejects payment terms > 365', () => {
    expect(() =>
      Customer.create({ ...baseProps, paymentTermsDays: 400 }),
    ).toThrow(InvalidCustomerFieldError);
  });

  it('round-trips through fromSnapshot', () => {
    const original: CustomerSnapshot = {
      id: 'x',
      tenantId: 't',
      code: 'A',
      name: 'B',
      taxId: null,
      creditLimitSatang: 5n,
      paymentTermsDays: 15,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };
    const c = Customer.fromSnapshot(original);
    expect(c.snapshot()).toBe(original);
  });
});
