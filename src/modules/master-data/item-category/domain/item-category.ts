import { DomainError } from '../../../../shared/errors';

export class ItemCategoryNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.ITEM_CATEGORY_NOT_FOUND';
  constructor(readonly categoryId: string) {
    super(`Item category ${categoryId} not found`);
  }
}

export class DuplicateItemCategoryCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_ITEM_CATEGORY_CODE';
  constructor(readonly categoryCode: string) {
    super(`Item category code "${categoryCode}" already exists in this tenant`);
  }
}

export class InvalidItemCategoryFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_ITEM_CATEGORY_FIELD';
}

/** Path column is NVARCHAR(2000); 37 chars per level -> 54 max. Keep headroom. */
export const MAX_CATEGORY_DEPTH = 50;

export interface ItemCategorySnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly parentId: string | null;
  /** Materialized path of ids, root first, self last: "/a/b/self/". */
  readonly path: string;
  /** 0 for a root. */
  readonly depth: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ParentRef {
  readonly id: string;
  readonly path: string;
  readonly depth: number;
}

export interface CreateItemCategoryProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly parent: ParentRef | null;
  readonly now: Date;
}

export class ItemCategory {
  private constructor(private readonly s: ItemCategorySnapshot) {}

  static create(props: CreateItemCategoryProps): ItemCategory {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidItemCategoryFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    if (!/^[A-Za-z0-9._-]+$/.test(code)) {
      throw new InvalidItemCategoryFieldError(
        'code may contain letters, digits, dot, underscore, dash',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidItemCategoryFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const depth = props.parent ? props.parent.depth + 1 : 0;
    if (depth > MAX_CATEGORY_DEPTH) {
      throw new InvalidItemCategoryFieldError(
        `category tree depth exceeds ${String(MAX_CATEGORY_DEPTH)}`,
      );
    }
    const path = props.parent
      ? `${props.parent.path}${props.id}/`
      : `/${props.id}/`;
    return new ItemCategory({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      parentId: props.parent?.id ?? null,
      path,
      depth,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ItemCategorySnapshot): ItemCategory {
    return new ItemCategory(s);
  }

  /** True when `this` sits anywhere under `ancestor` (or is it). */
  isWithin(ancestor: ItemCategorySnapshot): boolean {
    return this.s.path.startsWith(ancestor.path);
  }

  snapshot(): ItemCategorySnapshot {
    return this.s;
  }
}

export interface CategoryTreeNode {
  readonly category: ItemCategorySnapshot;
  readonly children: readonly CategoryTreeNode[];
}

/**
 * Folds a flat list into a forest. Siblings are ordered by name, then
 * code. A node whose parent is missing from the input (filtered out,
 * or data drift) is promoted to a root rather than dropped — losing a
 * subtree silently is worse than showing it in the wrong place.
 */
export function buildCategoryTree(
  flat: readonly ItemCategorySnapshot[],
): readonly CategoryTreeNode[] {
  const byId = new Map(flat.map((c) => [c.id, c]));
  const childrenOf = new Map<string | null, ItemCategorySnapshot[]>();
  for (const c of flat) {
    const key = c.parentId !== null && byId.has(c.parentId) ? c.parentId : null;
    const bucket = childrenOf.get(key) ?? [];
    bucket.push(c);
    childrenOf.set(key, bucket);
  }
  const sortSiblings = (xs: ItemCategorySnapshot[]): ItemCategorySnapshot[] =>
    [...xs].sort(
      (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
    );
  const build = (parentId: string | null): CategoryTreeNode[] =>
    sortSiblings(childrenOf.get(parentId) ?? []).map((category) => ({
      category,
      children: build(category.id),
    }));
  return build(null);
}
