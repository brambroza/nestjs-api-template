import type {
  ApprovalGateway,
  ApprovalOutcome,
  ApprovalStateView,
  ApprovalSubmitInput,
} from '../../approval';
import { CountApprovalPendingError } from '../domain';

import {
  CreateCountSheetUseCase,
  PostCountUseCase,
  RecordCountsUseCase,
  StartCountUseCase,
  SubmitCountUseCase,
} from './physical-count.use-cases';
import { StockLedgerService } from './stock-ledger.service';
import {
  FakeTx,
  FixedClock,
  InMemoryBalances,
  InMemoryCosts,
  InMemoryCounts,
  InMemoryInventoryOutbox,
  InMemoryInventoryRefLookup,
  InMemoryLots,
  InMemoryMovements,
  InMemoryReservations,
  InMemorySerials,
  tenantOf,
} from './testing/in-memory';

class FakeApprovals implements ApprovalGateway {
  next: ApprovalOutcome['status'] = 'APPROVED';
  readonly states = new Map<string, ApprovalStateView>();
  readonly submitted: ApprovalSubmitInput[] = [];
  async submit(input: ApprovalSubmitInput): Promise<ApprovalOutcome> {
    this.submitted.push(input);
    this.states.set(input.documentId, {
      status: this.next,
      requestId: 'apr-1',
    });
    return { requestId: 'apr-1', status: this.next };
  }
  async stateOf(_t: string, id: string): Promise<ApprovalStateView> {
    return this.states.get(id) ?? { status: 'NONE', requestId: null };
  }
}

describe('Physical count use cases', () => {
  it('freezes balances, counts, routes the variance through approval and posts adjustments', async () => {
    const tenant = tenantOf('t1', 'alice');
    const clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    const lots = new InMemoryLots();
    const balances = new InMemoryBalances(lots);
    const costs = new InMemoryCosts();
    const refs = new InMemoryInventoryRefLookup();
    const outbox = new InMemoryInventoryOutbox();
    refs.items.set('bolt', {
      id: 'bolt',
      sku: 'BOLT',
      name: 'Bolt',
      defaultUomCode: 'PCS',
      trackingPolicy: 'NONE',
      shelfLifeDays: null,
      isActive: true,
    });
    const ledger = new StockLedgerService(
      balances,
      new InMemoryMovements(),
      costs,
      lots,
      new InMemorySerials(),
      new InMemoryReservations(),
      refs,
      outbox,
      tenant,
      clock,
    );
    await ledger.post({
      warehouseId: 'wh-main',
      type: 'RECEIPT',
      currency: 'THB',
      referenceType: 'OPENING_BALANCE',
      referenceId: 'x',
      lines: [{ itemId: 'bolt', quantity: 10n, unitCostMinor: 2_00n }],
    });
    const counts = new InMemoryCounts();
    const tx = new FakeTx();
    const approvals = new FakeApprovals();
    const numbers = { next: async () => 'CNT-202609-0001' };
    const create = new CreateCountSheetUseCase(
      counts,
      balances,
      costs,
      refs,
      numbers,
      tx,
      tenant,
      clock,
    );
    const start = new StartCountUseCase(counts, tx, tenant, clock);
    const record = new RecordCountsUseCase(counts, tx, tenant, clock);
    const submit = new SubmitCountUseCase(
      counts,
      tx,
      tenant,
      clock,
      approvals,
      ledger,
    );
    const post = new PostCountUseCase(
      counts,
      tx,
      tenant,
      clock,
      approvals,
      ledger,
    );

    const sheet = await create.execute({ warehouseId: 'wh-main' });
    expect(sheet.snapshot().lines[0]).toMatchObject({
      itemSku: 'BOLT',
      systemQty: 10n,
      unitCostMinor: 2_00n,
    });
    await start.execute({ countId: sheet.id });
    const lineId = sheet.snapshot().lines[0]?.id ?? '';
    await record.execute({
      countId: sheet.id,
      entries: [{ lineId, countedQty: 7n }],
    });

    approvals.next = 'PENDING';
    const review = await submit.execute({ countId: sheet.id });
    expect(review.snapshot()).toMatchObject({
      status: 'REVIEW',
      approvalRequestId: 'apr-1',
    });
    expect(approvals.submitted[0]).toMatchObject({
      documentType: 'STOCK_ADJUSTMENT',
      amountMinor: 6_00n,
    });
    await expect(post.execute({ countId: sheet.id })).rejects.toBeInstanceOf(
      CountApprovalPendingError,
    );

    approvals.states.set(sheet.id, { status: 'APPROVED', requestId: 'apr-1' });
    const posted = await post.execute({ countId: sheet.id });
    expect(posted.status).toBe('POSTED');
    expect(
      (await balances.findByKey('t1', 'wh-main', 'bolt', null))?.onHandQty,
    ).toBe(7n);
    expect(outbox.rows.at(-1)?.event).toMatchObject({
      movementType: 'ADJUST_OUT',
      quantity: 3n,
      referenceType: 'STOCK_COUNT',
    });
  });
});
