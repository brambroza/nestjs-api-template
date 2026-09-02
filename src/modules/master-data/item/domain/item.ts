import { DomainError } from '../../../../shared/errors';

export class DuplicateItemSkuError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_ITEM_SKU';
  constructor(readonly sku: string) {
    super(`Item SKU "${sku}" already exists in this tenant`);
  }
}

export class ItemNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.ITEM_NOT_FOUND';
  constructor(readonly itemId: string) {
    super(`Item ${itemId} not found`);
  }
}

export class InvalidItemFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_ITEM_FIELD';
}

export interface ItemSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultUomCode: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateItemProps {
  readonly id: string;
  readonly tenantId: string;
  readonly sku: string;
  readonly name: string;
  readonly description?: string | null;
  readonly defaultUomCode: string;
  readonly now: Date;
}

/**
 * SKU is validated with a stricter charset than customer/vendor codes:
 * many downstream barcode/ERP integrations reject spaces and lowercase.
 * Keep this in sync with the barcode pipeline once it lands.
 */
export class Item {
  private constructor(private readonly s: ItemSnapshot) {}

  static create(props: CreateItemProps): Item {
    const sku = props.sku.trim();
    if (sku.length === 0 || sku.length > 64) {
      throw new InvalidItemFieldError(
        'sku must be a non-empty string up to 64 characters',
      );
    }
    if (!/^[A-Za-z0-9._-]+$/.test(sku)) {
      throw new InvalidItemFieldError(
        'sku may contain letters, digits, dot, underscore, dash only',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidItemFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const uom = props.defaultUomCode.trim();
    if (uom.length === 0 || uom.length > 16) {
      throw new InvalidItemFieldError(
        'defaultUomCode must be a non-empty string up to 16 characters',
      );
    }
    return new Item({
      id: props.id,
      tenantId: props.tenantId,
      sku,
      name,
      description: props.description?.trim() || null,
      defaultUomCode: uom,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ItemSnapshot): Item {
    return new Item(s);
  }

  snapshot(): ItemSnapshot {
    return this.s;
  }
}
