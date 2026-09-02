import { DomainError } from '../../../../shared/errors';

export class DuplicateWarehouseCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_WAREHOUSE_CODE';
  constructor(readonly warehouseCode: string) {
    super(`Warehouse code "${warehouseCode}" already exists in this tenant`);
  }
}

export class WarehouseNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.WAREHOUSE_NOT_FOUND';
  constructor(readonly warehouseId: string) {
    super(`Warehouse ${warehouseId} not found`);
  }
}

export class WarehouseBranchInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.WAREHOUSE_BRANCH_INVALID';
  constructor(readonly branchId: string) {
    super(`Branch ${branchId} does not exist or is inactive in this tenant`);
  }
}

export class DefaultWarehouseAlreadyExistsError extends DomainError {
  readonly code = 'MASTER_DATA.DEFAULT_WAREHOUSE_EXISTS';
  constructor(
    readonly branchId: string,
    readonly existingWarehouseId: string,
  ) {
    super(
      `Branch ${branchId} already has a default warehouse (${existingWarehouseId})`,
    );
  }
}

export class InvalidWarehouseFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_WAREHOUSE_FIELD';
}

export interface WarehouseSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateWarehouseProps {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly now: Date;
}

export class Warehouse {
  private constructor(private readonly s: WarehouseSnapshot) {}

  static create(props: CreateWarehouseProps): Warehouse {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidWarehouseFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidWarehouseFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    return new Warehouse({
      id: props.id,
      tenantId: props.tenantId,
      branchId: props.branchId,
      code,
      name,
      isDefault: props.isDefault ?? false,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: WarehouseSnapshot): Warehouse {
    return new Warehouse(s);
  }

  snapshot(): WarehouseSnapshot {
    return this.s;
  }
}
