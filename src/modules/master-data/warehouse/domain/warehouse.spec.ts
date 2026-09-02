import { InvalidWarehouseFieldError, Warehouse } from './warehouse';

describe('Warehouse aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const baseProps = {
    id: 'wh-1',
    tenantId: 't-1',
    branchId: 'br-1',
    code: 'WH-MAIN',
    name: 'Main Warehouse',
    now,
  };

  it('creates with isDefault=false by default', () => {
    const s = Warehouse.create(baseProps).snapshot();
    expect(s.isDefault).toBe(false);
    expect(s.isActive).toBe(true);
    expect(s.code).toBe('WH-MAIN');
  });

  it('honours isDefault=true', () => {
    expect(
      Warehouse.create({ ...baseProps, isDefault: true }).snapshot().isDefault,
    ).toBe(true);
  });

  it('rejects blank code and name', () => {
    expect(() => Warehouse.create({ ...baseProps, code: '  ' })).toThrow(
      InvalidWarehouseFieldError,
    );
    expect(() => Warehouse.create({ ...baseProps, name: '' })).toThrow(
      InvalidWarehouseFieldError,
    );
  });
});
