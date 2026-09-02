import {
  needsReorder,
  validateReorderRule,
  type ReorderRuleSnapshot,
} from './reorder-rule';

describe('reorder rule', () => {
  const base: ReorderRuleSnapshot = {
    id: 'r',
    tenantId: 't',
    warehouseId: 'w',
    itemId: 'i',
    reorderPoint: 100n,
    reorderQty: 500n,
    preferredVendorId: null,
    isActive: true,
    lastTriggeredAt: null,
    createdAt: new Date(0),
  };
  const now = new Date('2026-09-10T00:00:00.000Z');

  it('fires at or below the point, respects cooldown and inactive rules', () => {
    expect(needsReorder(base, 101n, now)).toBe(false);
    expect(needsReorder(base, 100n, now)).toBe(true);
    expect(
      needsReorder(
        { ...base, lastTriggeredAt: new Date('2026-09-05T00:00:00.000Z') },
        0n,
        now,
      ),
    ).toBe(false);
    expect(
      needsReorder(
        { ...base, lastTriggeredAt: new Date('2026-09-01T00:00:00.000Z') },
        0n,
        now,
      ),
    ).toBe(true);
    expect(needsReorder({ ...base, isActive: false }, 0n, now)).toBe(false);
    expect(() =>
      validateReorderRule({ reorderPoint: -1n, reorderQty: 1n }),
    ).toThrow();
    expect(() =>
      validateReorderRule({ reorderPoint: 0n, reorderQty: 0n }),
    ).toThrow();
  });
});
