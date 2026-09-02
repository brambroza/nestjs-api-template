import { DomainError } from '../../../shared/errors';

export class InventoryRefInvalidError extends DomainError {
  readonly code = 'INVENTORY.REF_INVALID';
}

export class InvalidMovementError extends DomainError {
  readonly code = 'INVENTORY.INVALID_MOVEMENT';
}

export interface StockShortage {
  readonly itemId: string;
  readonly itemSku: string;
  readonly uomCode: string;
  readonly requiredQty: bigint;
  readonly availableQty: bigint;
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INVENTORY.INSUFFICIENT_STOCK';
  constructor(
    readonly warehouseId: string,
    readonly shortages: readonly StockShortage[],
  ) {
    super(
      `Insufficient stock in warehouse ${warehouseId}: ${shortages
        .map(
          (s) =>
            `${s.itemSku} needs ${s.requiredQty.toString()} ${s.uomCode}, ${s.availableQty.toString()} available`,
        )
        .join('; ')}`,
    );
  }
}

export class ReservationExceedsStockError extends DomainError {
  readonly code = 'INVENTORY.RESERVATION_EXCEEDS_STOCK';
}

export class LotRequiredError extends DomainError {
  readonly code = 'INVENTORY.LOT_REQUIRED';
  constructor(readonly itemSku: string) {
    super(`Item ${itemSku} is lot-tracked; a lot number is required`);
  }
}

export class SerialMismatchError extends DomainError {
  readonly code = 'INVENTORY.SERIAL_MISMATCH';
}

export class SerialNotAvailableError extends DomainError {
  readonly code = 'INVENTORY.SERIAL_NOT_AVAILABLE';
  constructor(
    readonly itemSku: string,
    readonly serialNumber: string,
    readonly reason: string,
  ) {
    super(`Serial ${serialNumber} of ${itemSku}: ${reason}`);
  }
}

export class InventoryVersionConflictError extends DomainError {
  readonly code = 'INVENTORY.VERSION_CONFLICT';
  constructor(
    readonly key: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Stock record ${key} was modified concurrently (expected v${String(expectedVersion)}, found v${String(actualVersion)})`,
    );
  }
}

export class TransferNotFoundError extends DomainError {
  readonly code = 'INVENTORY.TRANSFER_NOT_FOUND';
  constructor(readonly transferId: string) {
    super(`Stock transfer ${transferId} not found`);
  }
}

export class IllegalTransferTransitionError extends DomainError {
  readonly code = 'INVENTORY.ILLEGAL_TRANSFER_TRANSITION';
  constructor(
    readonly transferId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Stock transfer ${transferId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvalidTransferError extends DomainError {
  readonly code = 'INVENTORY.INVALID_TRANSFER';
}

export class NoDefaultWarehouseError extends DomainError {
  readonly code = 'INVENTORY.NO_DEFAULT_WAREHOUSE';
  constructor(readonly companyId: string | null) {
    super(
      companyId
        ? `Company ${companyId} has no default warehouse`
        : 'Tenant has no default warehouse',
    );
  }
}
