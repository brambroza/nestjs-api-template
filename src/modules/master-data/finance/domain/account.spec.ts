import {
  Account,
  AccountType,
  buildAccountTree,
  InvalidAccountFieldError,
  normalBalanceOf,
} from './account';

describe('Account', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');

  it('derives normal balance from type', () => {
    expect(normalBalanceOf(AccountType.Asset)).toBe('DEBIT');
    expect(normalBalanceOf(AccountType.Expense)).toBe('DEBIT');
    expect(normalBalanceOf(AccountType.Liability)).toBe('CREDIT');
    expect(normalBalanceOf(AccountType.Equity)).toBe('CREDIT');
    expect(normalBalanceOf(AccountType.Revenue)).toBe('CREDIT');
  });

  it('a child must share its parent type', () => {
    const assets = Account.create({
      id: 'a',
      tenantId: 't',
      code: '1000',
      name: 'Assets',
      type: AccountType.Asset,
      parent: null,
      isPostable: false,
      now,
    });
    const cash = Account.create({
      id: 'c',
      tenantId: 't',
      code: '1100',
      name: 'Cash',
      type: AccountType.Asset,
      parent: assets.snapshot(),
      now,
    });
    expect(cash.snapshot()).toMatchObject({
      depth: 1,
      path: '/a/c/',
      isPostable: true,
    });
    expect(() =>
      Account.create({
        id: 'x',
        tenantId: 't',
        code: '2100',
        name: 'AP',
        type: AccountType.Liability,
        parent: assets.snapshot(),
        now,
      }),
    ).toThrow(InvalidAccountFieldError);
  });

  it('tree orders by code', () => {
    const snap = (id: string, code: string, parentId: string | null) => ({
      id,
      tenantId: 't',
      code,
      name: code,
      nameTh: null,
      type: AccountType.Asset,
      parentId,
      path: '',
      depth: 0,
      isPostable: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const tree = buildAccountTree([
      snap('b', '1200', 'r'),
      snap('r', '1000', null),
      snap('a', '1100', 'r'),
    ]);
    expect(tree.map((n) => n.account.code)).toEqual(['1000']);
    expect(tree[0]?.children.map((n) => n.account.code)).toEqual([
      '1100',
      '1200',
    ]);
  });
});
