import type { ReorderRuleSnapshot } from '../domain';

import type {
  ReorderRuleRepository,
  StockAvailabilityLookup,
} from './ports/reorder.ports';
import { ReorderSweepUseCase } from './reorder.use-cases';
import { CreateRequisitionUseCase } from './requisition.use-cases';
import {
  FakeNumbers,
  FakeTx,
  FixedClock,
  InMemoryPurchaseRefLookup,
  InMemoryRequisitionRepository,
  tenantOf,
} from './testing/in-memory';

class InMemoryRules implements ReorderRuleRepository {
  readonly rows = new Map<string, ReorderRuleSnapshot>();
  async findByKey(t: string, w: string, i: string) {
    return (
      [...this.rows.values()].find(
        (r) => r.tenantId === t && r.warehouseId === w && r.itemId === i,
      ) ?? null
    );
  }
  async list(t: string, w: string | null) {
    return [...this.rows.values()].filter(
      (r) => r.tenantId === t && (!w || r.warehouseId === w),
    );
  }
  async upsert(r: ReorderRuleSnapshot) {
    this.rows.set(r.id, r);
  }
  async markTriggered(id: string, at: Date) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, lastTriggeredAt: at });
  }
  async tenantsWithActiveRules() {
    return [...new Set([...this.rows.values()].map((r) => r.tenantId))];
  }
}

describe('ReorderSweepUseCase', () => {
  it('raises one requisition per company/vendor for rules at or below their point', async () => {
    const tenant = tenantOf('t1', 'system');
    const clock = new FixedClock(new Date('2026-09-10T00:00:00.000Z'));
    const refs = new InMemoryPurchaseRefLookup();
    refs.companies.set('co', { id: 'co', baseCurrency: 'THB', isActive: true });
    refs.vendors.set('v1', {
      id: 'v1',
      code: 'V',
      name: 'V',
      paymentTermsDays: 30,
      isActive: true,
    });
    refs.items.set('raw', {
      id: 'raw',
      sku: 'RAW-A',
      name: 'Raw',
      defaultUomCode: 'KG',
      trackingPolicy: 'LOT',
      isActive: true,
    });
    refs.items.set('bolt', {
      id: 'bolt',
      sku: 'BOLT',
      name: 'Bolt',
      defaultUomCode: 'PCS',
      trackingPolicy: 'NONE',
      isActive: true,
    });
    const rules = new InMemoryRules();
    const rule = (
      id: string,
      itemId: string,
      point: bigint,
    ): ReorderRuleSnapshot => ({
      id,
      tenantId: 't1',
      warehouseId: 'wh-main',
      itemId,
      reorderPoint: point,
      reorderQty: 500n,
      preferredVendorId: 'v1',
      isActive: true,
      lastTriggeredAt: null,
      createdAt: clock.current,
    });
    await rules.upsert(rule('r1', 'raw', 100n));
    await rules.upsert(rule('r2', 'bolt', 10n));
    const stock: StockAvailabilityLookup = {
      availableQty: async (_t, _w, itemId) => (itemId === 'raw' ? 80n : 50n),
    };
    const requisitions = new InMemoryRequisitionRepository();
    const createPr = new CreateRequisitionUseCase(
      requisitions,
      refs,
      new FakeNumbers(),
      new FakeTx(),
      tenant,
      clock,
    );
    const sweep = new ReorderSweepUseCase(
      rules,
      stock,
      refs,
      createPr,
      tenant,
      clock,
    );

    const first = await sweep.execute();
    expect(first).toEqual({
      checked: 2,
      triggered: 1,
      requisitionNumbers: ['PR-202609-0001'],
    });
    const pr = [...requisitions.store.rows.values()][0]?.snapshot();
    expect(pr?.lines[0]).toMatchObject({
      itemSku: 'RAW-A',
      quantity: 500n,
      suggestedVendorId: 'v1',
    });
    // cooldown: the same rule stays quiet the next night
    clock.current = new Date('2026-09-11T00:00:00.000Z');
    expect((await sweep.execute()).triggered).toBe(0);
  });
});
