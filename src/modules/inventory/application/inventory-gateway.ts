import { Inject, Injectable } from '@nestjs/common';

import type { IsoDate } from '../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  InventoryRefInvalidError,
  MovementType,
  NoDefaultWarehouseError,
  type StockShortage,
} from '../domain';

import {
  INVENTORY_REF_LOOKUP,
  type InventoryRefLookup,
} from './ports/inventory-ref-lookup.port';
import {
  StockLedgerService,
  type PostLineCommand,
} from './stock-ledger.service';

export const INVENTORY_GATEWAY = Symbol('INVENTORY_GATEWAY');

export interface InventoryLineInput {
  readonly itemId?: string | null;
  /** Alternative to itemId (production-order speaks SKU). */
  readonly itemSku?: string | null;
  readonly quantity: bigint;
  readonly uomCode?: string | null;
  readonly unitCostMinor?: bigint | null;
  readonly lotNumber?: string | null;
  readonly expiryDate?: IsoDate | null;
  readonly serialNumbers?: readonly string[] | null;
}

export interface InventoryDocumentRef {
  readonly referenceType: string;
  readonly referenceId: string;
}

export interface InventoryReceiveInput extends InventoryDocumentRef {
  readonly warehouseId: string;
  readonly currency: string;
  readonly lines: readonly InventoryLineInput[];
}

export interface InventoryIssueInput extends InventoryDocumentRef {
  /** Omit to use the company's (or tenant's) default warehouse. */
  readonly warehouseId?: string | null;
  readonly companyId?: string | null;
  readonly currency?: string | null;
  readonly lines: readonly InventoryLineInput[];
  readonly consumeReservations?: boolean;
}

export interface InventoryReserveInput extends InventoryDocumentRef {
  readonly warehouseId?: string | null;
  readonly companyId?: string | null;
  readonly lines: readonly InventoryLineInput[];
}

export interface PostedMovementView {
  readonly movementId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly lotId: string | null;
  readonly quantity: bigint;
  readonly uomCode: string;
  readonly unitCostMinor: bigint;
  readonly costMinor: bigint;
  readonly currency: string;
}

export type ReserveOutcome =
  | { readonly kind: 'reserved'; readonly warehouseId: string }
  | {
      readonly kind: 'shortage';
      readonly warehouseId: string;
      readonly shortages: readonly StockShortage[];
    };

/**
 * The ONLY inventory surface other modules see (re-exported from the
 * module root). Every call joins the caller's transaction via CLS, so
 * a delivery that fails half-way rolls its stock issue back with it.
 */
export interface InventoryGateway {
  receive(input: InventoryReceiveInput): Promise<readonly PostedMovementView[]>;
  /** Throws InsufficientStockError (409) when any line cannot be covered. */
  issue(input: InventoryIssueInput): Promise<readonly PostedMovementView[]>;
  reserve(input: InventoryReserveInput): Promise<ReserveOutcome>;
  release(ref: InventoryDocumentRef): Promise<number>;
  resolveDefaultWarehouse(companyId: string | null): Promise<string>;
}

@Injectable()
export class InventoryGatewayService implements InventoryGateway {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(INVENTORY_REF_LOOKUP) private readonly refs: InventoryRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async receive(
    input: InventoryReceiveInput,
  ): Promise<readonly PostedMovementView[]> {
    const lines = await this.resolveLines(input.lines);
    const posted = await this.ledger.post({
      warehouseId: input.warehouseId,
      type: MovementType.Receipt,
      currency: input.currency,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      lines,
    });
    return posted.map(toView);
  }

  async issue(
    input: InventoryIssueInput,
  ): Promise<readonly PostedMovementView[]> {
    const warehouseId =
      input.warehouseId ??
      (await this.resolveDefaultWarehouse(input.companyId ?? null));
    const lines = await this.resolveLines(input.lines);
    const posted = await this.ledger.post({
      warehouseId,
      type: MovementType.Issue,
      currency: input.currency ?? 'THB',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      lines,
      consumeReservations: input.consumeReservations ?? true,
    });
    return posted.map(toView);
  }

  async reserve(input: InventoryReserveInput): Promise<ReserveOutcome> {
    const warehouseId =
      input.warehouseId ??
      (await this.resolveDefaultWarehouse(input.companyId ?? null));
    const lines = await this.resolveLines(input.lines);
    const r = await this.ledger.reserve({
      warehouseId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      lines,
    });
    return r.kind === 'reserved'
      ? { kind: 'reserved', warehouseId: r.warehouseId }
      : {
          kind: 'shortage',
          warehouseId: r.warehouseId,
          shortages: r.shortages,
        };
  }

  async release(ref: InventoryDocumentRef): Promise<number> {
    return this.ledger.release(ref.referenceType, ref.referenceId);
  }

  async resolveDefaultWarehouse(companyId: string | null): Promise<string> {
    const id = await this.refs.findDefaultWarehouse(
      this.tenant.getTenantId(),
      companyId,
    );
    if (!id) throw new NoDefaultWarehouseError(companyId);
    return id;
  }

  private async resolveLines(
    lines: readonly InventoryLineInput[],
  ): Promise<PostLineCommand[]> {
    const tenantId = this.tenant.getTenantId();
    const out: PostLineCommand[] = [];
    for (const l of lines) {
      let itemId = (l.itemId ?? '').trim();
      if (itemId.length === 0) {
        const sku = (l.itemSku ?? '').trim();
        const item = sku ? await this.refs.findItemBySku(tenantId, sku) : null;
        if (!item)
          throw new InventoryRefInvalidError(
            `item ${sku || '?'} does not exist`,
          );
        itemId = item.id;
      }
      out.push({
        itemId,
        quantity: l.quantity,
        uomCode: l.uomCode ?? null,
        unitCostMinor: l.unitCostMinor ?? null,
        lotNumber: l.lotNumber ?? null,
        expiryDate: l.expiryDate ?? null,
        serialNumbers: l.serialNumbers ?? null,
      });
    }
    return out;
  }
}

function toView(m: {
  id: string;
  itemId: string;
  itemSku: string;
  lotId: string | null;
  quantity: bigint;
  uomCode: string;
  unitCostMinor: bigint;
  costMinor: bigint;
  currency: string;
}): PostedMovementView {
  return {
    movementId: m.id,
    itemId: m.itemId,
    itemSku: m.itemSku,
    lotId: m.lotId,
    quantity: m.quantity,
    uomCode: m.uomCode,
    unitCostMinor: m.unitCostMinor,
    costMinor: m.costMinor,
    currency: m.currency,
  };
}
