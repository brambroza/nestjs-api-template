import type { IsoDate } from '../../../../shared/domain';
import type {
  AverageCostSnapshot,
  CostLayerSnapshot,
  LotSnapshot,
  SerialUnitSnapshot,
  StockBalanceSnapshot,
  StockMovementSnapshot,
  StockTransfer,
  TransferStatus,
} from '../../domain';

export const STOCK_BALANCE_REPOSITORY = Symbol('STOCK_BALANCE_REPOSITORY');
export const STOCK_MOVEMENT_REPOSITORY = Symbol('STOCK_MOVEMENT_REPOSITORY');
export const COST_REPOSITORY = Symbol('COST_REPOSITORY');
export const LOT_REPOSITORY = Symbol('LOT_REPOSITORY');
export const SERIAL_REPOSITORY = Symbol('SERIAL_REPOSITORY');
export const RESERVATION_REPOSITORY = Symbol('RESERVATION_REPOSITORY');
export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export interface BalanceWithLot {
  readonly balance: StockBalanceSnapshot;
  readonly lotNumber: string | null;
  readonly expiryDate: IsoDate | null;
}

export interface StockBalanceRepository {
  /** All lot balances of one item in one warehouse. */
  listForItem(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]>;
  listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]>;
  listByWarehouse(
    tenantId: string,
    warehouseId: string,
    page: { readonly limit: number; readonly offset: number },
  ): Promise<{
    readonly items: readonly BalanceWithLot[];
    readonly total: number;
  }>;
  findByKey(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ): Promise<StockBalanceSnapshot | null>;
  create(b: StockBalanceSnapshot): Promise<void>;
  /** Optimistic lock on version; returns the row at version + 1. */
  save(b: StockBalanceSnapshot): Promise<StockBalanceSnapshot>;
}

export interface MovementFilter {
  readonly itemId?: string | null;
  readonly warehouseId?: string | null;
  readonly referenceType?: string | null;
  readonly referenceId?: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface StockMovementRepository {
  append(m: StockMovementSnapshot): Promise<void>;
  list(
    tenantId: string,
    filter: MovementFilter,
  ): Promise<{
    readonly items: readonly StockMovementSnapshot[];
    readonly total: number;
  }>;
}

export interface CostRepository {
  /** Layers with remainingQty > 0; lotId null = every lot. */
  openLayers(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ): Promise<readonly CostLayerSnapshot[]>;
  listLayersByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly CostLayerSnapshot[]>;
  createLayer(layer: CostLayerSnapshot): Promise<void>;
  saveLayers(layers: readonly CostLayerSnapshot[]): Promise<void>;
  findAverage(
    tenantId: string,
    itemId: string,
  ): Promise<AverageCostSnapshot | null>;
  /** Insert or update with optimistic lock; returns at version + 1. */
  saveAverage(avg: AverageCostSnapshot): Promise<AverageCostSnapshot>;
}

export interface LotWithStock {
  readonly lot: LotSnapshot;
  readonly onHandQty: bigint;
}

export interface LotRepository {
  findById(tenantId: string, id: string): Promise<LotSnapshot | null>;
  findByNumber(
    tenantId: string,
    itemId: string,
    lotNumber: string,
  ): Promise<LotSnapshot | null>;
  create(lot: LotSnapshot): Promise<void>;
  listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly LotWithStock[]>;
  /** Tenant-free (cron): lots with stock expiring on or before `until`. */
  listExpiringAllTenants(
    until: IsoDate,
    limit: number,
  ): Promise<readonly LotWithStock[]>;
}

export interface SerialRepository {
  findMany(
    tenantId: string,
    itemId: string,
    serialNumbers: readonly string[],
  ): Promise<readonly SerialUnitSnapshot[]>;
  findBySerial(
    tenantId: string,
    serialNumber: string,
  ): Promise<readonly SerialUnitSnapshot[]>;
  upsertMany(units: readonly SerialUnitSnapshot[]): Promise<void>;
}

export interface ReservationSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly lotId: string | null;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly status: 'ACTIVE' | 'RELEASED' | 'CONSUMED';
  readonly referenceType: string;
  readonly referenceId: string;
  readonly createdAt: Date;
}

export interface ReservationRepository {
  listActive(
    tenantId: string,
    referenceType: string,
    referenceId: string,
  ): Promise<readonly ReservationSnapshot[]>;
  create(r: ReservationSnapshot): Promise<void>;
  save(r: ReservationSnapshot): Promise<void>;
}

export interface TransferRepository {
  findById(tenantId: string, id: string): Promise<StockTransfer | null>;
  list(
    tenantId: string,
    filter: {
      readonly status?: TransferStatus | null;
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<{
    readonly items: readonly StockTransfer[];
    readonly total: number;
  }>;
  create(t: StockTransfer): Promise<void>;
  save(t: StockTransfer): Promise<StockTransfer>;
}
