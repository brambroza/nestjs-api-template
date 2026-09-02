import type { DocumentLineInput } from '../../../../shared/domain';

import { OverReceiptError, PurchaseApprovalPendingError } from './errors';
import { GoodsReceipt, InvalidGoodsReceiptError } from './goods-receipt';
import {
  IllegalPurchaseOrderTransitionError,
  PurchaseOrder,
  PurchaseOrderHasReceiptsError,
  PurchaseOrderStatus,
} from './purchase-order';
import {
  IllegalRequisitionTransitionError,
  PurchaseRequisition,
  RequisitionNotConvertibleError,
  RequisitionStatus,
} from './requisition';

const now = new Date('2026-09-02T03:00:00.000Z');

describe('PurchaseRequisition', () => {
  const make = () =>
    PurchaseRequisition.create({
      id: 'pr1',
      tenantId: 't',
      companyId: 'co',
      number: 'PR-202609-0001',
      requesterId: 'alice',
      currency: 'thb',
      purpose: 'restock',
      lines: [
        {
          id: 'l1',
          itemId: 'i',
          itemSku: 'RAW-A',
          description: 'Raw A',
          uomCode: 'kg',
          quantity: 100n,
          estimatedUnitPriceMinor: 50_00n,
          suggestedVendorId: null,
        },
      ],
      now,
    });

  it('estimates the total and walks submit -> approve -> convert', () => {
    const pr = make();
    expect(pr.snapshot()).toMatchObject({
      currency: 'THB',
      estimatedTotalMinor: 5_000_00n,
    });
    const pending = pr.submit(
      { approvalRequestId: 'a1', approval: 'PENDING' },
      now,
    );
    expect(pending.status).toBe(RequisitionStatus.PendingApproval);
    expect(() => pending.applyApprovalOutcome('PENDING', now)).toThrow(
      PurchaseApprovalPendingError,
    );
    const approved = pending.applyApprovalOutcome('APPROVED', now);
    expect(approved.isConvertible).toBe(true);
    const converted = approved.markConverted('po1', now);
    expect(converted.snapshot()).toMatchObject({
      status: 'CONVERTED',
      purchaseOrderId: 'po1',
    });
    expect(() => converted.markConverted('po2', now)).toThrow(
      RequisitionNotConvertibleError,
    );
    expect(() => converted.cancel(now)).toThrow(
      IllegalRequisitionTransitionError,
    );
  });

  it('rejected requisitions reopen as drafts', () => {
    const rejected = make()
      .submit({ approvalRequestId: 'a1', approval: 'PENDING' }, now)
      .applyApprovalOutcome('REJECTED', now);
    expect(rejected.reopen(now).snapshot()).toMatchObject({
      status: 'DRAFT',
      approvalRequestId: null,
    });
  });
});

describe('PurchaseOrder + GoodsReceipt', () => {
  const line = (id: string, quantity: bigint): DocumentLineInput => ({
    id,
    itemId: 'i',
    itemSku: 'RAW-A',
    description: 'Raw A',
    uomCode: 'KG',
    quantity,
    unitPriceMinor: 50_00n,
    priceSource: 'MANUAL',
    priceListId: null,
    discountBp: 0,
    taxCodeId: 'tax-vat7',
    taxCode: 'VAT7',
    taxRateBp: 700,
  });
  const make = () =>
    PurchaseOrder.create({
      id: 'po1',
      tenantId: 't',
      companyId: 'co',
      number: 'PO-202609-0001',
      vendorId: 'v1',
      currency: 'THB',
      orderDate: '2026-09-02',
      paymentTermsDays: 30,
      createdBy: 'alice',
      lines: [line('l1', 100n), line('l2', 20n)],
      now,
    });
  const issued = () =>
    make().submit({ approvalRequestId: 'a1', approval: 'APPROVED' }, now);

  it('issues on auto-approval and totals with VAT', () => {
    expect(issued().snapshot()).toMatchObject({
      status: PurchaseOrderStatus.Issued,
      totalMinor: 6_420_00n,
      issuedAt: now,
    });
  });

  it('receives partially then fully, never over', () => {
    const po = issued();
    const part = po.recordReceipt(
      [{ purchaseOrderLineId: 'l1', quantity: 60n }],
      now,
    );
    expect(part.status).toBe(PurchaseOrderStatus.PartiallyReceived);
    expect(part.remainingQty('l1')).toBe(40n);
    expect(() =>
      part.recordReceipt([{ purchaseOrderLineId: 'l1', quantity: 41n }], now),
    ).toThrow(OverReceiptError);
    expect(() => part.cancel(null, now)).toThrow(PurchaseOrderHasReceiptsError);
    const done = part.recordReceipt(
      [
        { purchaseOrderLineId: 'l1', quantity: 40n },
        { purchaseOrderLineId: 'l2', quantity: 20n },
      ],
      now,
    );
    expect(done.status).toBe(PurchaseOrderStatus.Received);
    expect(() =>
      make().recordReceipt([{ purchaseOrderLineId: 'l1', quantity: 1n }], now),
    ).toThrow(IllegalPurchaseOrderTransitionError);
  });

  it('goods receipt validates lot capture and posts once', () => {
    const grn = GoodsReceipt.create({
      id: 'g1',
      tenantId: 't',
      purchaseOrderId: 'po1',
      number: 'GRN-202609-0001',
      receiptDate: '2026-09-05',
      warehouseId: 'wh-main',
      createdBy: 'alice',
      lines: [
        {
          id: 'x',
          purchaseOrderLineId: 'l1',
          itemId: 'i',
          itemSku: 'RAW-A',
          uomCode: 'KG',
          quantity: 60n,
          lotNumber: ' LOT-1 ',
          expiryDate: '2027-09-05',
        },
      ],
      now,
    });
    expect(grn.snapshot().lines[0]?.lotNumber).toBe('LOT-1');
    const posted = grn.post(now);
    expect(posted.status).toBe('POSTED');
    expect(() => posted.cancel(now)).toThrow(/POSTED -> CANCELLED/);
    expect(() =>
      GoodsReceipt.create({
        id: 'g2',
        tenantId: 't',
        purchaseOrderId: 'po1',
        number: 'GRN-2',
        receiptDate: '2026-09-05',
        warehouseId: 'wh-main',
        createdBy: 'alice',
        now,
        lines: [
          {
            id: 'x',
            purchaseOrderLineId: 'l1',
            itemId: 'i',
            itemSku: 'RAW-A',
            uomCode: 'KG',
            quantity: 1n,
            lotNumber: null,
            expiryDate: 'bad',
          },
        ],
      }),
    ).toThrow(InvalidGoodsReceiptError);
  });
});
