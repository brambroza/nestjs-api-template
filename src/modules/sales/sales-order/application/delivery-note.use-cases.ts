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
import { INVENTORY_GATEWAY, type InventoryGateway } from '../../../inventory';
import {
  SALES_REF_LOOKUP,
  SalesRefInvalidError,
  type SalesRefLookup,
} from '../../shared';
import {
  DeliveryNote,
  DeliveryNoteNotFoundError,
  DeliveryNoteVersionConflictError,
  InvalidDeliveryNoteError,
  OverDeliveryError,
  SalesOrderNotFoundError,
  SalesOrderStatus,
  type DeliveryNoteLineInput,
} from '../domain';

import {
  DELIVERY_NOTE_REPOSITORY,
  type DeliveryNoteRepository,
} from './ports/delivery-note.repository';
import { SALES_ORDER_OUTBOX, type SalesOrderOutbox } from './ports/outbox.port';
import {
  SALES_ORDER_REPOSITORY,
  type SalesOrderRepository,
} from './ports/sales-order.repository';
import { SALES_ORDER_STOCK_REFERENCE } from './sales-order.use-cases';

export const DELIVERY_NOTE_NUMBER_PREFIX = 'DN';

export interface DeliveryLineRequest {
  readonly salesOrderLineId: string;
  readonly quantity: bigint;
}

export interface CreateDeliveryNoteInput {
  readonly salesOrderId: string;
  readonly deliveryDate?: IsoDate | null;
  readonly warehouseId?: string | null;
  readonly shipToAddress?: string | null;
  readonly notes?: string | null;
  /** Omit to deliver everything still outstanding. */
  readonly lines?: readonly DeliveryLineRequest[] | null;
}

/** T-214: a DRAFT note for an order that is CONFIRMED or partially delivered. */
@Injectable()
export class CreateDeliveryNoteUseCase {
  constructor(
    @Inject(DELIVERY_NOTE_REPOSITORY)
    private readonly notes: DeliveryNoteRepository,
    @Inject(SALES_ORDER_REPOSITORY)
    private readonly orders: SalesOrderRepository,
    @Inject(SALES_REF_LOOKUP) private readonly refs: SalesRefLookup,
    @Inject(DOCUMENT_NUMBER_GENERATOR)
    private readonly numbers: DocumentNumberGenerator,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateDeliveryNoteInput): Promise<DeliveryNote> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const warehouseId = (input.warehouseId ?? '').trim() || null;
    if (
      warehouseId &&
      !(await this.refs.warehouseExists(tenantId, warehouseId))
    ) {
      throw new SalesRefInvalidError(
        `warehouse ${warehouseId} does not exist or is inactive`,
      );
    }
    return this.tx.runInTransaction(async () => {
      const order = await this.orders.findById(tenantId, input.salesOrderId);
      if (!order) throw new SalesOrderNotFoundError(input.salesOrderId);
      const os = order.snapshot();
      if (
        os.status !== SalesOrderStatus.Confirmed &&
        os.status !== SalesOrderStatus.PartiallyDelivered
      ) {
        throw new InvalidDeliveryNoteError(
          `sales order ${os.number} is ${os.status}; only CONFIRMED / PARTIALLY_DELIVERED orders can be delivered`,
        );
      }
      const requests: readonly DeliveryLineRequest[] =
        input.lines ??
        os.lines
          .filter((l) => l.quantity > l.deliveredQty)
          .map((l) => ({
            salesOrderLineId: l.id,
            quantity: l.quantity - l.deliveredQty,
          }));
      const lines: DeliveryNoteLineInput[] = requests.map((r) => {
        const line = os.lines.find((l) => l.id === r.salesOrderLineId);
        if (!line) {
          throw new InvalidDeliveryNoteError(
            `line ${r.salesOrderLineId} does not belong to order ${os.number}`,
          );
        }
        const remaining = line.quantity - line.deliveredQty;
        if (r.quantity > remaining)
          throw new OverDeliveryError(line.id, remaining, r.quantity);
        return {
          id: randomUUID(),
          salesOrderLineId: line.id,
          itemId: line.itemId,
          itemSku: line.itemSku,
          uomCode: line.uomCode,
          quantity: r.quantity,
        };
      });
      const note = DeliveryNote.create({
        id: randomUUID(),
        tenantId,
        salesOrderId: os.id,
        number: await this.numbers.next(
          tenantId,
          DELIVERY_NOTE_NUMBER_PREFIX,
          now,
        ),
        deliveryDate: input.deliveryDate ?? toIsoDate(now),
        warehouseId,
        shipToAddress: input.shipToAddress,
        notes: input.notes,
        createdBy: this.tenant.getUserId(),
        lines,
        now,
      });
      await this.notes.create(note);
      return note;
    });
  }
}

export interface DeliveryNoteActionInput {
  readonly deliveryNoteId: string;
  readonly expectedVersion?: number | null;
}

function assertExpectedVersion(
  n: DeliveryNote,
  expected: number | null | undefined,
): void {
  if (expected !== null && expected !== undefined && expected !== n.version) {
    throw new DeliveryNoteVersionConflictError(n.id, expected, n.version);
  }
}

/** Ships the note and posts the quantities onto the order in one transaction. */
@Injectable()
export class ShipDeliveryNoteUseCase {
  constructor(
    @Inject(DELIVERY_NOTE_REPOSITORY)
    private readonly notes: DeliveryNoteRepository,
    @Inject(SALES_ORDER_REPOSITORY)
    private readonly orders: SalesOrderRepository,
    @Inject(SALES_ORDER_OUTBOX) private readonly outbox: SalesOrderOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(INVENTORY_GATEWAY) private readonly inventory: InventoryGateway,
  ) {}

  async execute(input: DeliveryNoteActionInput): Promise<DeliveryNote> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const now = this.clock.now();
    return this.tx.runInTransaction(async () => {
      const note = await this.notes.findById(tenantId, input.deliveryNoteId);
      if (!note) throw new DeliveryNoteNotFoundError(input.deliveryNoteId);
      assertExpectedVersion(note, input.expectedVersion);
      const ns = note.snapshot();
      const order = await this.orders.findById(tenantId, ns.salesOrderId);
      if (!order) throw new SalesOrderNotFoundError(ns.salesOrderId);
      const shipped = await this.notes.save(note.ship(now));
      const delivered = await this.orders.save(
        order.recordDelivery(
          ns.lines.map((l) => ({
            salesOrderLineId: l.salesOrderLineId,
            quantity: l.quantity,
          })),
          now,
        ),
      );
      const ds = delivered.snapshot();
      // T-213/T-214: stock leaves the warehouse with the goods, consuming the order's hold first.
      await this.inventory.issue({
        warehouseId: ns.warehouseId,
        companyId: ds.companyId,
        currency: ds.currency,
        referenceType: SALES_ORDER_STOCK_REFERENCE,
        referenceId: ds.id,
        consumeReservations: true,
        lines: ns.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomCode: l.uomCode,
        })),
      });
      if (ds.status === SalesOrderStatus.Delivered) {
        await this.inventory.release({
          referenceType: SALES_ORDER_STOCK_REFERENCE,
          referenceId: ds.id,
        });
      }
      await this.outbox.enqueue({
        idempotencyKey: `${ds.id}:delivered:${shipped.id}`,
        event: {
          type: 'sales_order.delivered.v1',
          aggregateId: ds.id,
          tenantId: ds.tenantId,
          occurredAt: now,
          number: ds.number,
          customerId: ds.customerId,
          totalMinor: ds.totalMinor,
          currency: ds.currency,
          actor: userId,
          deliveryNoteId: shipped.id,
          deliveryNoteNumber: shipped.snapshot().number,
          complete: ds.status === SalesOrderStatus.Delivered,
        },
      });
      return shipped;
    });
  }
}

@Injectable()
export class CancelDeliveryNoteUseCase {
  constructor(
    @Inject(DELIVERY_NOTE_REPOSITORY)
    private readonly notes: DeliveryNoteRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeliveryNoteActionInput): Promise<DeliveryNote> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const note = await this.notes.findById(tenantId, input.deliveryNoteId);
      if (!note) throw new DeliveryNoteNotFoundError(input.deliveryNoteId);
      assertExpectedVersion(note, input.expectedVersion);
      return this.notes.save(note.cancel(this.clock.now()));
    });
  }
}

@Injectable()
export class GetDeliveryNoteUseCase {
  constructor(
    @Inject(DELIVERY_NOTE_REPOSITORY)
    private readonly notes: DeliveryNoteRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<DeliveryNote> {
    const note = await this.notes.findById(this.tenant.getTenantId(), id);
    if (!note) throw new DeliveryNoteNotFoundError(id);
    return note;
  }
}

@Injectable()
export class ListDeliveryNotesForOrderUseCase {
  constructor(
    @Inject(DELIVERY_NOTE_REPOSITORY)
    private readonly notes: DeliveryNoteRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(salesOrderId: string): Promise<readonly DeliveryNote[]> {
    return this.notes.listForOrder(this.tenant.getTenantId(), salesOrderId);
  }
}
