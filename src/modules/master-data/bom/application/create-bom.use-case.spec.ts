import {
  BomComponentInvalidError,
  BomCycleError,
  BomProductInvalidError,
  DuplicateBomVersionError,
} from '../domain';

import { ActivateBomUseCase } from './activate-bom.use-case';
import { CreateBomUseCase } from './create-bom.use-case';
import {
  AutocommitTransactionManager,
  FixedClock,
  FixedTenantContext,
  InMemoryBomItemLookup,
  InMemoryBomRepository,
} from './testing/in-memory';

describe('CreateBomUseCase / ActivateBomUseCase', () => {
  const tenantId = 't-1';
  const now = new Date('2026-09-01T00:00:00.000Z');
  let repo: InMemoryBomRepository;
  let items: InMemoryBomItemLookup;
  let create: CreateBomUseCase;
  let activate: ActivateBomUseCase;
  let tx: AutocommitTransactionManager;

  beforeEach(() => {
    repo = new InMemoryBomRepository();
    items = new InMemoryBomItemLookup();
    for (const [id, sku, uom] of [
      ['A', 'FIN-A', 'PCS'],
      ['B', 'SUB-B', 'PCS'],
      ['C', 'RAW-C', 'KG'],
    ] as const) {
      items.put({ id, sku, defaultUomCode: uom, isActive: true });
    }
    items.put({
      id: 'OFF',
      sku: 'OFF',
      defaultUomCode: 'PCS',
      isActive: false,
    });
    const tenant = new FixedTenantContext(tenantId, 'u-1');
    const clock = new FixedClock(now);
    tx = new AutocommitTransactionManager();
    create = new CreateBomUseCase(repo, items, tenant, clock);
    activate = new ActivateBomUseCase(repo, tx, tenant, clock);
  });

  const comp = (componentItemId: string, qty = 1n) => ({
    componentItemId,
    qtyPerUnit: qty,
  });

  it('auto-numbers versions, resolves sku + default uom from the item catalogue', async () => {
    const v1 = await create.execute({
      itemId: 'A',
      components: [comp('C', 2n)],
    });
    const v2 = await create.execute({
      itemId: 'A',
      components: [comp('C', 3n)],
    });
    expect(v1.snapshot().version).toBe(1);
    expect(v2.snapshot().version).toBe(2);
    expect(v1.snapshot().productSku).toBe('FIN-A');
    expect(v1.snapshot().components[0]).toMatchObject({
      componentSku: 'RAW-C',
      qtyPerUnitUom: 'KG',
      minPackUom: 'KG',
    });
    await expect(
      create.execute({ itemId: 'A', version: 2, components: [comp('C')] }),
    ).rejects.toThrow(DuplicateBomVersionError);
  });

  it('rejects unknown/inactive product and components', async () => {
    await expect(
      create.execute({ itemId: 'nope', components: [comp('C')] }),
    ).rejects.toThrow(BomProductInvalidError);
    await expect(
      create.execute({ itemId: 'OFF', components: [comp('C')] }),
    ).rejects.toThrow(BomProductInvalidError);
    await expect(
      create.execute({ itemId: 'A', components: [comp('OFF')] }),
    ).rejects.toThrow(BomComponentInvalidError);
  });

  it('detects a multi-level cycle through ACTIVE BOMs only', async () => {
    // B (active) needs A. Now defining A needs B would loop.
    const bOfA = await create.execute({ itemId: 'B', components: [comp('A')] });
    await activate.execute(bOfA.snapshot().id);
    await expect(
      create.execute({ itemId: 'A', components: [comp('B')] }),
    ).rejects.toThrow(BomCycleError);

    // An inactive version does not participate in explosion.
    const cOfB = await create.execute({ itemId: 'C', components: [comp('B')] });
    expect(cOfB.snapshot().isActive).toBe(false);
    await expect(
      create.execute({ itemId: 'B', version: 9, components: [comp('C')] }),
    ).resolves.toBeDefined();
  });

  it('activation swaps the active version atomically and is idempotent', async () => {
    const v1 = await create.execute({ itemId: 'A', components: [comp('C')] });
    const v2 = await create.execute({ itemId: 'A', components: [comp('C')] });
    await activate.execute(v1.snapshot().id);
    expect(
      (await repo.findActiveForItem(tenantId, 'A'))?.snapshot().version,
    ).toBe(1);

    await activate.execute(v2.snapshot().id);
    expect(
      (await repo.findActiveForItem(tenantId, 'A'))?.snapshot().version,
    ).toBe(2);
    expect(repo.rows.get(v1.snapshot().id)?.snapshot().isActive).toBe(false);
    expect(tx.calls).toBe(2);

    const again = await activate.execute(v2.snapshot().id);
    expect(again.snapshot().isActive).toBe(true);
  });
});
