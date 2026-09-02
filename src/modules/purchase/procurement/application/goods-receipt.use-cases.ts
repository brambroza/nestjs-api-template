import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { toIsoDate, type IsoDate } from '../../../../shared/domain';
import {
  DOCUMENT_NUMBER_GENERATOR,
  type DocumentNumberGenerator,
} from '../../../../shared/sequence';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  GoodsReceipt,
  GoodsReceiptNotFoundError,
  InvalidGoodsReceiptError,
  OverReceiptError,
  PurchaseOrderNotFoundError,
  PurchaseOrderStatus,
  PurchaseRefInvalidError,
  PurchaseVersionConflictError,
  type GoodsReceiptLineInput,
} from '../domain';

import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepository,
} from './ports/goods-receipt.repository';
import { PURCHASE_OUTBOX, type PurchaseOutbox } from './ports/outbox.port';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from './ports/purchase-order.repository';
import {
  PURCHASE_REF_LOOKUP,
  type PurchaseRefLookup,
} from './ports/purchase-ref-lookup.port';

export const GOODS_RECEIPT_NUMBER_PREFIX = 'GRN';

export interface ReceiptLineRequest {
  readonly purchaseOrderLineId: string;
  readonly quantity: bigint;
  readonly lotNumber?: string | null;
  readonly expiryDate?: IsoDate | null;
}

export interface CreateGoodsReceiptInput {
  readonly purchaseOrderId: string;
  readonly warehouseId: string;
  readonly receiptDate?: IsoDate | null;
  readonly vendorDeliveryRef?: string | null;
  readonly notes?: string | null;
  /** Omit to receive everything still open (only valid when no line needs a lot). */
  readonly lines?: readonly ReceiptLineRequest[] | null;
}

/** T-223: capture a receipt against an ISSUED / partially received PO; LOT items need a lot number. */
@Injectable()
export class CreateGoodsReceiptUseCase {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY)
    private readonly receipts: GoodsReceiptRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const warehouseId = input.warehouseId.trim();
    if (!(await this.refs.warehouseExists(tenantId, warehouseId))) {
      throw new PurchaseRefInvalidError(
        `warehouse ${warehouseId} does not exist or is inactive`,
      );
    }
    return this.tx.runInTransaction(async () => {
      const order = await this.orders.findById(tenantId, input.purchaseOrderId);
      if (!order) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
      const os = order.snapshot();
      if (
        os.status !== PurchaseOrderStatus.Issued &&
        os.status !== PurchaseOrderStatus.PartiallyReceived
      ) {
        throw new InvalidGoodsReceiptError(
          `purchase order ${os.number} is ${os.status}; only ISSUED / PARTIALLY_RECEIVED orders can be received`,
        );
      }
      const requests: readonly ReceiptLineRequest[] =
        input.lines ??
        os.lines
          .filter((l) => l.quantity > l.receivedQty)
          .map((l) => ({
            purchaseOrderLineId: l.id,
            quantity: l.quantity - l.receivedQty,
          }));
      const lines: GoodsReceiptLineInput[] = [];
      for (const r of requests) {
        const line = os.lines.find((l) => l.id === r.purchaseOrderLineId);
        if (!line) {
          throw new InvalidGoodsReceiptError(
            `line ${r.purchaseOrderLineId} does not belong to order ${os.number}`,
          );
        }
        const remaining = line.quantity - line.receivedQty;
        if (r.quantity > remaining)
          throw new OverReceiptError(line.id, remaining, r.quantity);
        const item = await this.refs.findItem(tenantId, line.itemId);
        const lotNumber = (r.lotNumber ?? '').trim() || null;
        if (item?.trackingPolicy === 'LOT' && lotNumber === null) {
          throw new InvalidGoodsReceiptError(
            `item ${line.itemSku} is lot-tracked; lotNumber is required`,
          );
        }
        lines.push({
          id: randomUUID(),
          purchaseOrderLineId: line.id,
          itemId: line.itemId,
          itemSku: line.itemSku,
          uomCode: line.uomCode,
          quantity: r.quantity,
          lotNumber,
          expiryDate: r.expiryDate ?? null,
        });
      }
      const grn = GoodsReceipt.create({
        id: randomUUID(),
        tenantId,
        purchaseOrderId: os.id,
        number: await this.numbers.next(
          tenantId,
          GOODS_RECEIPT_NUMBER_PREFIX,
          now,
        ),
        receiptDate: input.receiptDate ?? toIsoDate(now),
        warehouseId,
        vendorDeliveryRef: input.vendorDeliveryRef,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.receipts.create(grn);
      return grn;
    });
  }
}

export interface GoodsReceiptActionInput {
  readonly goodsReceiptId: string;
  readonly expectedVersion?: number | null;
}

function assertVersion(
  g: GoodsReceipt,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== g.version) {
    throw new PurchaseVersionConflictError(g.id, expected, g.version);
  }
}

/** Posts the receipt and the received quantities onto the PO in one transaction. */
@Injectable()
export class PostGoodsReceiptUseCase {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY)
    private readonly receipts: GoodsReceiptRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASE_OUTBOX) private readonly outbox: PurchaseOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GoodsReceiptActionInput): Promise<GoodsReceipt> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const grn = await this.receipts.findById(tenantId, input.goodsReceiptId);
      if (!grn) throw new GoodsReceiptNotFoundError(input.goodsReceiptId);
      assertVersion(grn, input.expectedVersion);
      const gs = grn.snapshot();
      const order = await this.orders.findById(tenantId, gs.purchaseOrderId);
      if (!order) throw new PurchaseOrderNotFoundError(gs.purchaseOrderId);
      const posted = await this.receipts.save(grn.post(now));
      const received = await this.orders.save(
        order.recordReceipt(
          gs.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            quantity: l.quantity,
          })),
          now,
        ),
      );
      const rs = received.snapshot();
      await this.outbox.enqueue({
        idempotencyKey: `${rs.id}:received:${posted.id}`,
        event: {
          type: 'purchase_order.received.v1',
          aggregateId: rs.id,
          tenantId: rs.tenantId,
          occurredAt: now,
          number: rs.number,
          amountMinor: rs.totalMinor,
          currency: rs.currency,
          actor: userId,
          vendorId: rs.vendorId,
          goodsReceiptId: posted.id,
          goodsReceiptNumber: posted.snapshot().number,
          warehouseId: gs.warehouseId,
          complete: rs.status === PurchaseOrderStatus.Received,
        },
      });
      return posted;
    });
  }
}

@Injectable()
export class CancelGoodsReceiptUseCase {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY)
    private readonly receipts: GoodsReceiptRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GoodsReceiptActionInput): Promise<GoodsReceipt> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const grn = await this.receipts.findById(tenantId, input.goodsReceiptId);
      if (!grn) throw new GoodsReceiptNotFoundError(input.goodsReceiptId);
      assertVersion(grn, input.expectedVersion);
      return this.receipts.save(grn.cancel(this.clock.now()));
    });
  }
}

@Injectable()
export class GetGoodsReceiptUseCase {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY)
    private readonly receipts: GoodsReceiptRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<GoodsReceipt> {
    const grn = await this.receipts.findById(this.tenant.getTenantId(), id);
    if (!grn) throw new GoodsReceiptNotFoundError(id);
    return grn;
  }
}

@Injectable()
export class ListGoodsReceiptsForOrderUseCase {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY)
    private readonly receipts: GoodsReceiptRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(purchaseOrderId: string): Promise<readonly GoodsReceipt[]> {
    return this.receipts.listForOrder(
      this.tenant.getTenantId(),
      purchaseOrderId,
    );
  }
}
