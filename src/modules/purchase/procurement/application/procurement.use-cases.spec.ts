import {
  InvalidGoodsReceiptError,
  OverReceiptError,
  PurchaseApprovalPendingError,
  PurchaseOrderStatus,
  RequisitionNotConvertibleError,
  RequisitionStatus,
} from '../domain';

import {
  CreateGoodsReceiptUseCase,
  PostGoodsReceiptUseCase,
} from './goods-receipt.use-cases';
import {
  ConfirmPurchaseOrderUseCase,
  CreatePurchaseOrderUseCase,
  SubmitPurchaseOrderUseCase,
} from './purchase-order.use-cases';
import {
  ConfirmRequisitionUseCase,
  CreateRequisitionUseCase,
  SubmitRequisitionUseCase,
} from './requisition.use-cases';
import { FakeInventoryGateway } from '../../../inventory/testing';

import {
  FakeApprovalGateway,
  FakeNumbers,
  FakeTx,
  FixedClock,
  InMemoryGoodsReceiptRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseOutbox,
  InMemoryPurchaseRefLookup,
  InMemoryPurchaseTax,
  InMemoryRequisitionRepository,
  tenantOf,
} from './testing/in-memory';

describe('Procurement use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  const tx = new FakeTx();
  let requisitions: InMemoryRequisitionRepository;
  let orders: InMemoryPurchaseOrderRepository;
  let receipts: InMemoryGoodsReceiptRepository;
  let refs: InMemoryPurchaseRefLookup;
  let approvals: FakeApprovalGateway;
  let outbox: InMemoryPurchaseOutbox;
  let numbers: FakeNumbers;
  let clock: FixedClock;
  let createPr: CreateRequisitionUseCase;
  let submitPr: SubmitRequisitionUseCase;
  let confirmPr: ConfirmRequisitionUseCase;
  let createPo: CreatePurchaseOrderUseCase;
  let submitPo: SubmitPurchaseOrderUseCase;
  let confirmPo: ConfirmPurchaseOrderUseCase;
  let createGrn: CreateGoodsReceiptUseCase;
  let postGrn: PostGoodsReceiptUseCase;
  let inventory: FakeInventoryGateway;

  beforeEach(() => {
    requisitions = new InMemoryRequisitionRepository();
    orders = new InMemoryPurchaseOrderRepository();
    receipts = new InMemoryGoodsReceiptRepository();
    refs = new InMemoryPurchaseRefLookup();
    approvals = new FakeApprovalGateway();
    outbox = new InMemoryPurchaseOutbox();
    numbers = new FakeNumbers();
    inventory = new FakeInventoryGateway();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    const tax = new InMemoryPurchaseTax();
    refs.companies.set('co', { id: 'co', baseCurrency: 'THB', isActive: true });
    refs.vendors.set('v1', {
      id: 'v1',
      code: 'VEND-001',
      name: 'Steel Co',
      paymentTermsDays: 45,
      isActive: true,
    });
    refs.items.set('raw', {
      id: 'raw',
      sku: 'RAW-A',
      name: 'Raw Material A',
      defaultUomCode: 'KG',
      trackingPolicy: 'LOT',
      isActive: true,
    });
    createPr = new CreateRequisitionUseCase(
      requisitions,
      refs,
      numbers,
      tx,
      tenant,
      clock,
    );
    submitPr = new SubmitRequisitionUseCase(
      requisitions,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
    confirmPr = new ConfirmRequisitionUseCase(
      requisitions,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
    createPo = new CreatePurchaseOrderUseCase(
      orders,
      requisitions,
      refs,
      tax,
      numbers,
      tx,
      tenant,
      clock,
    );
    submitPo = new SubmitPurchaseOrderUseCase(
      orders,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
    confirmPo = new ConfirmPurchaseOrderUseCase(
      orders,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
    createGrn = new CreateGoodsReceiptUseCase(
      receipts,
      orders,
      refs,
      numbers,
      tx,
      tenant,
      clock,
    );
    postGrn = new PostGoodsReceiptUseCase(
      receipts,
      orders,
      outbox,
      tx,
      tenant,
      clock,
      inventory,
    );
  });

  it('PR -> approval -> PO conversion at estimated prices, requisition marked CONVERTED', async () => {
    approvals.nextOutcome = 'PENDING';
    const pr = await createPr.execute({
      companyId: 'co',
      purpose: 'restock',
      lines: [
        { itemId: 'raw', quantity: 100n, estimatedUnitPriceMinor: 50_00n },
      ],
    });
    expect(pr.snapshot()).toMatchObject({
      number: 'PR-202609-0001',
      estimatedTotalMinor: 5_000_00n,
    });
    const pending = await submitPr.execute({ requisitionId: pr.id });
    expect(pending.status).toBe(RequisitionStatus.PendingApproval);
    expect(approvals.submitted[0]).toMatchObject({
      documentType: 'PURCHASE_REQUISITION',
      amountMinor: 5_000_00n,
    });
    await expect(
      createPo.execute({ requisitionId: pr.id, vendorId: 'v1' }),
    ).rejects.toBeInstanceOf(RequisitionNotConvertibleError);
    await expect(
      confirmPr.execute({ requisitionId: pr.id }),
    ).rejects.toBeInstanceOf(PurchaseApprovalPendingError);
    approvals.states.set(pr.id, { status: 'APPROVED', requestId: 'apr-1' });
    expect((await confirmPr.execute({ requisitionId: pr.id })).status).toBe(
      RequisitionStatus.Approved,
    );

    const po = await createPo.execute({ requisitionId: pr.id, vendorId: 'v1' });
    expect(po.snapshot()).toMatchObject({
      number: 'PO-202609-0001',
      requisitionId: pr.id,
      paymentTermsDays: 45,
      notes: 'restock',
      totalMinor: 5_350_00n,
    });
    expect(po.snapshot().lines[0]).toMatchObject({
      unitPriceMinor: 50_00n,
      priceSource: 'MANUAL',
      taxCode: 'VAT7',
    });
    expect(
      (await requisitions.findById('t1', pr.id))?.snapshot(),
    ).toMatchObject({
      status: 'CONVERTED',
      purchaseOrderId: po.id,
    });
  });

  it('PO submit through the matrix, then goods receipts with lot capture post onto the order', async () => {
    const po = await createPo.execute({
      companyId: 'co',
      vendorId: 'v1',
      lines: [{ itemId: 'raw', quantity: 100n, unitPriceMinor: 50_00n }],
    });
    approvals.nextOutcome = 'PENDING';
    const pending = await submitPo.execute({ purchaseOrderId: po.id });
    expect(pending.status).toBe(PurchaseOrderStatus.PendingApproval);
    approvals.states.set(po.id, { status: 'APPROVED', requestId: 'apr-1' });
    const issued = await confirmPo.execute({ purchaseOrderId: po.id });
    expect(issued.snapshot()).toMatchObject({
      status: PurchaseOrderStatus.Issued,
      issuedAt: clock.current,
    });
    const lineId = issued.snapshot().lines[0]?.id ?? '';

    // LOT-tracked item requires a lot number
    await expect(
      createGrn.execute({
        purchaseOrderId: po.id,
        warehouseId: 'wh-main',
        lines: [{ purchaseOrderLineId: lineId, quantity: 60n }],
      }),
    ).rejects.toBeInstanceOf(InvalidGoodsReceiptError);
    const grn = await createGrn.execute({
      purchaseOrderId: po.id,
      warehouseId: 'wh-main',
      vendorDeliveryRef: 'DO-777',
      lines: [
        {
          purchaseOrderLineId: lineId,
          quantity: 60n,
          lotNumber: 'L-2609',
          expiryDate: '2027-09-01',
        },
      ],
    });
    expect(grn.snapshot().number).toBe('GRN-202609-0001');
    await postGrn.execute({ goodsReceiptId: grn.id });
    const after = await orders.findById('t1', po.id);
    expect(after?.status).toBe(PurchaseOrderStatus.PartiallyReceived);
    expect(after?.remainingQty(lineId)).toBe(40n);
    await expect(
      createGrn.execute({
        purchaseOrderId: po.id,
        warehouseId: 'wh-main',
        lines: [{ purchaseOrderLineId: lineId, quantity: 41n, lotNumber: 'x' }],
      }),
    ).rejects.toBeInstanceOf(OverReceiptError);
    const rest = await createGrn.execute({
      purchaseOrderId: po.id,
      warehouseId: 'wh-main',
      lines: [
        { purchaseOrderLineId: lineId, quantity: 40n, lotNumber: 'L-2610' },
      ],
    });
    await postGrn.execute({ goodsReceiptId: rest.id });
    expect((await orders.findById('t1', po.id))?.status).toBe(
      PurchaseOrderStatus.Received,
    );
    expect(outbox.rows.map((r) => r.event.type)).toEqual([
      'purchase_order.submitted.v1',
      'purchase_order.issued.v1',
      'purchase_order.received.v1',
      'purchase_order.received.v1',
    ]);
    expect(outbox.rows.at(-1)?.event).toMatchObject({
      complete: true,
      warehouseId: 'wh-main',
    });
  });
});
