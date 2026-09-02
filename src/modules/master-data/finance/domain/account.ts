import { DomainError } from '../../../../shared/errors';

export const AccountType = {
  Asset: 'ASSET',
  Liability: 'LIABILITY',
  Equity: 'EQUITY',
  Revenue: 'REVENUE',
  Expense: 'EXPENSE',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];
export function isAccountType(v: string): v is AccountType {
  return (Object.values(AccountType) as readonly string[]).includes(v);
}

export const NormalBalance = { Debit: 'DEBIT', Credit: 'CREDIT' } as const;
export type NormalBalance = (typeof NormalBalance)[keyof typeof NormalBalance];

/** Assets and expenses increase on the debit side; the rest on credit. */
export function normalBalanceOf(type: AccountType): NormalBalance {
  return type === AccountType.Asset || type === AccountType.Expense
    ? NormalBalance.Debit
    : NormalBalance.Credit;
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'FINANCE.ACCOUNT_NOT_FOUND';
  constructor(readonly accountId: string) {
    super(`Account ${accountId} not found`);
  }
}
export class DuplicateAccountCodeError extends DomainError {
  readonly code = 'FINANCE.DUPLICATE_ACCOUNT_CODE';
  constructor(readonly accountCode: string) {
    super(`Account code "${accountCode}" already exists in this tenant`);
  }
}
export class InvalidAccountFieldError extends DomainError {
  readonly code = 'FINANCE.INVALID_ACCOUNT_FIELD';
}

export const MAX_ACCOUNT_DEPTH = 10;

export interface AccountSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh: string | null;
  readonly type: AccountType;
  readonly parentId: string | null;
  readonly path: string;
  readonly depth: number;
  readonly isPostable: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AccountParentRef {
  readonly id: string;
  readonly path: string;
  readonly depth: number;
  readonly type: AccountType;
}

export interface CreateAccountProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh?: string | null;
  readonly type: AccountType;
  readonly parent: AccountParentRef | null;
  /** Headers (grouping rows) are not postable; leaves default to postable. */
  readonly isPostable?: boolean;
  readonly now: Date;
}

export class Account {
  private constructor(private readonly s: AccountSnapshot) {}

  static create(props: CreateAccountProps): Account {
    const code = props.code.trim().toUpperCase();
    if (!/^[0-9A-Z.-]{1,16}$/.test(code)) {
      throw new InvalidAccountFieldError(
        'code must be 1-16 chars of digits, letters, dot, dash',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidAccountFieldError('name must be 1-200 characters');
    }
    const nameTh = (props.nameTh ?? '').trim() || null;
    if (nameTh !== null && nameTh.length > 200) {
      throw new InvalidAccountFieldError('nameTh must be <= 200 characters');
    }
    if (props.parent && props.parent.type !== props.type) {
      throw new InvalidAccountFieldError(
        `a ${props.type} account cannot sit under a ${props.parent.type} parent`,
      );
    }
    const depth = props.parent ? props.parent.depth + 1 : 0;
    if (depth > MAX_ACCOUNT_DEPTH) {
      throw new InvalidAccountFieldError(
        `chart depth exceeds ${String(MAX_ACCOUNT_DEPTH)}`,
      );
    }
    return new Account({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      nameTh,
      type: props.type,
      parentId: props.parent?.id ?? null,
      path: props.parent ? `${props.parent.path}${props.id}/` : `/${props.id}/`,
      depth,
      isPostable: props.isPostable ?? true,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: AccountSnapshot): Account {
    return new Account(s);
  }

  get normalBalance(): NormalBalance {
    return normalBalanceOf(this.s.type);
  }

  snapshot(): AccountSnapshot {
    return this.s;
  }
}

export interface AccountTreeNode {
  readonly account: AccountSnapshot;
  readonly children: readonly AccountTreeNode[];
}

/** Forest ordered by code at every level; orphans promoted to roots. */
export function buildAccountTree(
  flat: readonly AccountSnapshot[],
): readonly AccountTreeNode[] {
  const byId = new Map(flat.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, AccountSnapshot[]>();
  for (const a of flat) {
    const key = a.parentId !== null && byId.has(a.parentId) ? a.parentId : null;
    const bucket = childrenOf.get(key) ?? [];
    bucket.push(a);
    childrenOf.set(key, bucket);
  }
  const build = (parentId: string | null): AccountTreeNode[] =>
    [...(childrenOf.get(parentId) ?? [])]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => ({ account, children: build(account.id) }));
  return build(null);
}
