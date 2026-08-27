import { InvalidIdError, OrderId, TenantId, UserId, Sku } from './ids';

describe('brand id factories', () => {
  it.each([
    ['TenantId', () => TenantId.of('t')],
    ['UserId', () => UserId.of('u')],
    ['OrderId', () => OrderId.of('o')],
    ['Sku', () => Sku.of('s')],
  ])(
    '%s.of() returns the value unchanged for a non-empty string',
    (_, make) => {
      expect(typeof make()).toBe('string');
    },
  );

  it.each([
    ['TenantId', () => TenantId.of('')],
    ['TenantId whitespace', () => TenantId.of('   ')],
    ['UserId', () => UserId.of('')],
    ['OrderId', () => OrderId.of('')],
    ['Sku', () => Sku.of('')],
  ])('%s.of() rejects empty/whitespace input', (_, make) => {
    expect(make).toThrow(InvalidIdError);
  });
});
