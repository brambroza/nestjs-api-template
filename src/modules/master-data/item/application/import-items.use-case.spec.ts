import {
  ImportOutcome,
  ImportTooLargeError,
  Item,
  MAX_IMPORT_ROWS,
  type ItemImportRow,
} from '../domain';

import { ImportItemsUseCase } from './import-items.use-case';
import {
  AutocommitTransactionManager,
  FixedClock,
  FixedTenantContext,
  InMemoryCategoryLookup,
  InMemoryItemRepository,
  InMemoryUomCatalogLookup,
} from './testing/in-memory';

describe('ImportItemsUseCase', () => {
  const tenantId = 't-1';
  const now = new Date('2026-09-01T00:00:00.000Z');
  let repo: InMemoryItemRepository;
  let tx: AutocommitTransactionManager;
  let sut: ImportItemsUseCase;

  const row = (
    rowNumber: number,
    sku: string,
    o: Partial<ItemImportRow> = {},
  ): ItemImportRow => ({
    rowNumber,
    sku,
    name: `Item ${sku}`,
    defaultUomCode: 'PCS',
    description: null,
    categoryCode: null,
    trackingPolicy: null,
    shelfLifeDays: null,
    ...o,
  });

  beforeEach(() => {
    repo = new InMemoryItemRepository();
    repo.rows.set(
      'existing',
      Item.create({
        id: 'existing',
        tenantId,
        sku: 'EXISTS-1',
        name: 'already there',
        defaultUomCode: 'PCS',
        now,
      }),
    );
    tx = new AutocommitTransactionManager();
    sut = new ImportItemsUseCase(
      repo,
      new InMemoryUomCatalogLookup(['PCS', 'KG']),
      new InMemoryCategoryLookup(new Map([['RM', 'cat-rm']])),
      tx,
      new FixedTenantContext(tenantId, 'u-1'),
      new FixedClock(now),
    );
  });

  it('imports a clean file in one transaction', async () => {
    const r = await sut.execute({
      rows: [
        row(2, 'A-1', {
          categoryCode: 'rm',
          trackingPolicy: 'lot',
          shelfLifeDays: '90',
        }),
        row(3, 'A-2', { defaultUomCode: 'kg' }),
      ],
    });
    expect(r).toMatchObject({
      outcome: ImportOutcome.Imported,
      totalRows: 2,
      validRows: 2,
      insertedRows: 2,
      errors: [],
    });
    expect(tx.calls).toBe(1);
    expect(repo.rows.size).toBe(3);
    const a1 = [...repo.rows.values()].find((i) => i.snapshot().sku === 'A-1');
    expect(a1?.snapshot()).toMatchObject({
      categoryId: 'cat-rm',
      trackingPolicy: 'LOT',
      shelfLifeDays: 90,
    });
  });

  it('reports every row problem with its row number and rejects by default', async () => {
    const r = await sut.execute({
      rows: [
        row(2, 'OK-1'),
        row(3, ''),
        row(4, 'exists-1'),
        row(5, 'DUP-1'),
        row(6, 'dup-1'),
        row(7, 'BAD-UOM', { defaultUomCode: 'TON' }),
        row(8, 'BAD-CAT', { categoryCode: 'NOPE' }),
        row(9, 'BAD-POL', { trackingPolicy: 'BATCH' }),
        row(10, 'BAD-SHELF', {
          trackingPolicy: 'LOT',
          shelfLifeDays: 'ninety',
        }),
        row(11, 'SHELF-NO-LOT', { shelfLifeDays: '10' }),
        row(12, 'has space'),
      ],
    });
    expect(r.outcome).toBe(ImportOutcome.Rejected);
    expect(r.insertedRows).toBe(0);
    expect(r.validRows).toBe(2); // OK-1 and the first DUP-1
    expect(r.errors.map((e) => e.rowNumber)).toEqual([
      3, 4, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(r.errors.find((e) => e.rowNumber === 4)?.message).toMatch(
      /already exists/,
    );
    expect(r.errors.find((e) => e.rowNumber === 6)?.message).toMatch(
      /duplicate/,
    );
    expect(r.errors.find((e) => e.rowNumber === 11)?.message).toMatch(/LOT/);
    expect(repo.rows.size).toBe(1);
    expect(tx.calls).toBe(0);
  });

  it('allowPartial inserts the valid rows and reports PARTIAL', async () => {
    const r = await sut.execute({
      rows: [row(2, 'OK-1'), row(3, 'OK-1')],
      allowPartial: true,
    });
    expect(r.outcome).toBe(ImportOutcome.Partial);
    expect(r.insertedRows).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(repo.rows.size).toBe(2);
  });

  it('dryRun validates without writing', async () => {
    const r = await sut.execute({ rows: [row(2, 'OK-1')], dryRun: true });
    expect(r.outcome).toBe(ImportOutcome.DryRun);
    expect(r.validRows).toBe(1);
    expect(r.insertedRows).toBe(0);
    expect(repo.rows.size).toBe(1);
  });

  it('refuses a file over the row cap before touching the DB', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      row(i + 2, `S-${String(i)}`),
    );
    await expect(sut.execute({ rows })).rejects.toThrow(ImportTooLargeError);
  });
});
