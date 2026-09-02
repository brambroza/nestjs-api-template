import {
  buildCategoryTree,
  InvalidItemCategoryFieldError,
  ItemCategory,
  MAX_CATEGORY_DEPTH,
  type ItemCategorySnapshot,
} from './item-category';

describe('ItemCategory', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const root = ItemCategory.create({
    id: 'root',
    tenantId: 't',
    code: 'RAW',
    name: 'Raw materials',
    parent: null,
    now,
  });

  it('root has depth 0 and path /id/', () => {
    expect(root.snapshot()).toMatchObject({
      depth: 0,
      path: '/root/',
      parentId: null,
    });
  });

  it('child extends the parent path and depth', () => {
    const child = ItemCategory.create({
      id: 'steel',
      tenantId: 't',
      code: 'RAW-STEEL',
      name: 'Steel',
      parent: root.snapshot(),
      now,
    });
    expect(child.snapshot()).toMatchObject({
      depth: 1,
      path: '/root/steel/',
      parentId: 'root',
    });
    expect(child.isWithin(root.snapshot())).toBe(true);
    expect(root.isWithin(child.snapshot())).toBe(false);
  });

  it('rejects a parent already at max depth', () => {
    expect(() =>
      ItemCategory.create({
        id: 'x',
        tenantId: 't',
        code: 'X',
        name: 'x',
        parent: { id: 'p', path: '/p/', depth: MAX_CATEGORY_DEPTH },
        now,
      }),
    ).toThrow(InvalidItemCategoryFieldError);
  });

  it('rejects a bad code', () => {
    expect(() =>
      ItemCategory.create({ ...baseProps(), code: 'has space' }),
    ).toThrow(InvalidItemCategoryFieldError);
  });

  function baseProps(): Parameters<typeof ItemCategory.create>[0] {
    return { id: 'i', tenantId: 't', code: 'C', name: 'n', parent: null, now };
  }
});

describe('buildCategoryTree', () => {
  const snap = (
    id: string,
    parentId: string | null,
    name: string,
  ): ItemCategorySnapshot => ({
    id,
    tenantId: 't',
    code: id.toUpperCase(),
    name,
    parentId,
    path: '',
    depth: 0,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  it('nests children under parents and sorts siblings by name', () => {
    const tree = buildCategoryTree([
      snap('b', null, 'Beta'),
      snap('a', null, 'Alpha'),
      snap('a2', 'a', 'Zed'),
      snap('a1', 'a', 'Apple'),
      snap('a1x', 'a1', 'Deep'),
    ]);
    expect(tree.map((n) => n.category.id)).toEqual(['a', 'b']);
    const a = tree[0];
    expect(a?.children.map((n) => n.category.id)).toEqual(['a1', 'a2']);
    expect(a?.children[0]?.children.map((n) => n.category.id)).toEqual(['a1x']);
  });

  it('promotes a node whose parent is absent to a root instead of dropping it', () => {
    const tree = buildCategoryTree([snap('orphan', 'missing', 'Orphan')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.category.id).toBe('orphan');
  });
});
