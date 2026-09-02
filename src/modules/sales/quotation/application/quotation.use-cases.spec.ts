import { CurrencyMismatchError } from '../../shared';
import {
  FakeNumbers,
  FakeTx,
  FixedClock,
  InMemoryPricing,
  InMemorySalesRefLookup,
  tenantOf,
} from '../../shared/testing';
import { QuotationStatus, QuotationVersionConflictError } from '../domain';

import { ExpireQuotationsUseCase } from './expire-quotations.use-case';
import {
  AcceptQuotationUseCase,
  CreateQuotationUseCase,
  ReviseQuotationUseCase,
  SendQuotationUseCase,
  UpdateQuotationUseCase,
} from './quotation.use-cases';
import {
  InMemoryOutbox,
  InMemoryQuotationRepository,
} from './testing/in-memory';

describe('Quotation use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  let repo: InMemoryQuotationRepository;
  let refs: InMemorySalesRefLookup;
  let pricing: InMemoryPricing;
  let outbox: InMemoryOutbox;
  let clock: FixedClock;
  let create: CreateQuotationUseCase;
  let send: SendQuotationUseCase;
  let accept: AcceptQuotationUseCase;

  beforeEach(() => {
    repo = new InMemoryQuotationRepository();
    refs = new InMemorySalesRefLookup();
    pricing = new InMemoryPricing();
    outbox = new InMemoryOutbox();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    refs.companies.set('co', { id: 'co', baseCurrency: 'THB', isActive: true });
    refs.customers.set('c1', {
      id: 'c1',
      code: 'CUST-001',
      name: 'Demo',
      paymentTermsDays: 30,
      creditLimitMinor: 1_000_000_00n,
      isActive: true,
    });
    refs.items.set('i1', {
      id: 'i1',
      sku: 'FIN-A',
      name: 'Finished Product A',
      defaultUomCode: 'PCS',
      isActive: true,
    });
    pricing.prices.set('i1', {
      unitPriceMinor: 1_400_00n,
      currency: 'THB',
      priceListId: 'pl',
    });
    const tx = new FakeTx();
    create = new CreateQuotationUseCase(
      repo,
      refs,
      pricing,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    send = new SendQuotationUseCase(repo, outbox, tx, tenant, clock);
    accept = new AcceptQuotationUseCase(repo, outbox, tx, tenant, clock);
  });

  it('creates a numbered draft priced from the price list with VAT', async () => {
    const q = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      lines: [{ itemId: 'i1', quantity: 10n }],
    });
    const s = q.snapshot();
    expect(s.number).toBe('QT-202609-0001');
    expect(s.currency).toBe('THB');
    expect(s.paymentTermsDays).toBe(30);
    expect(s.quoteDate).toBe('2026-09-02');
    expect(s.validUntil).toBe('2026-10-02');
    expect(s.lines[0]).toMatchObject({
      itemSku: 'FIN-A',
      description: 'Finished Product A',
      priceSource: 'PRICE_LIST',
      taxCode: 'VAT7',
    });
    expect(s.totalMinor).toBe(14_980_00n);
  });

  it('a manual price bypasses the list; a foreign-currency list is rejected', async () => {
    const q = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      lines: [{ itemId: 'i1', quantity: 1n, unitPriceMinor: 999_00n }],
    });
    expect(q.snapshot().lines[0]?.priceSource).toBe('MANUAL');
    await expect(
      create.execute({
        companyId: 'co',
        customerId: 'c1',
        currency: 'USD',
        lines: [{ itemId: 'i1', quantity: 1n }],
      }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
  });

  it('send -> accept writes one outbox event per transition and bumps the version', async () => {
    const q = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      lines: [{ itemId: 'i1', quantity: 2n }],
    });
    const sent = await send.execute({ quotationId: q.id });
    expect(sent.status).toBe(QuotationStatus.Sent);
    expect(sent.version).toBe(1);
    const accepted = await accept.execute({
      quotationId: q.id,
      expectedVersion: 1,
    });
    expect(accepted.version).toBe(2);
    expect(outbox.rows.map((r) => r.event.type)).toEqual([
      'quotation.sent.v1',
      'quotation.accepted.v1',
    ]);
    await expect(
      accept.execute({ quotationId: q.id, expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(QuotationVersionConflictError);
  });

  it('update re-prices a draft and revise cuts revision 2 from a sent quote', async () => {
    const q = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      lines: [{ itemId: 'i1', quantity: 1n }],
    });
    const update = new UpdateQuotationUseCase(
      repo,
      refs,
      pricing,
      new FakeTx(),
      tenant,
      clock,
    );
    pricing.prices.set('i1', {
      unitPriceMinor: 1_000_00n,
      currency: 'THB',
      priceListId: 'pl2',
    });
    const updated = await update.execute({
      quotationId: q.id,
      notes: 'ราคาพิเศษ',
      lines: [{ itemId: 'i1', quantity: 5n, discountBp: 500 }],
    });
    expect(updated.snapshot()).toMatchObject({
      notes: 'ราคาพิเศษ',
      subtotalMinor: 5_000_00n,
      discountMinor: 250_00n,
      totalMinor: 5_082_50n,
    });
    await send.execute({ quotationId: q.id });
    const revise = new ReviseQuotationUseCase(
      repo,
      new FakeTx(),
      tenant,
      clock,
    );
    const rev = await revise.execute({ quotationId: q.id });
    expect(rev.snapshot()).toMatchObject({
      number: 'QT-202609-0001',
      revision: 2,
      status: 'DRAFT',
    });
    await expect(revise.execute({ quotationId: q.id })).rejects.toThrow(
      /revision 2 already exists/,
    );
  });

  it('the expiry sweep flips only past-due SENT quotations', async () => {
    const a = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      validUntil: '2026-09-10',
      lines: [{ itemId: 'i1', quantity: 1n }],
    });
    const b = await create.execute({
      companyId: 'co',
      customerId: 'c1',
      validUntil: '2026-12-31',
      lines: [{ itemId: 'i1', quantity: 1n }],
    });
    await send.execute({ quotationId: a.id });
    await send.execute({ quotationId: b.id });
    clock.current = new Date('2026-09-11T01:00:00.000Z');
    const expire = new ExpireQuotationsUseCase(
      repo,
      outbox,
      new FakeTx(),
      clock,
    );
    expect(await expire.execute()).toEqual({
      checked: 1,
      expired: 1,
      skipped: 0,
    });
    expect((await repo.findById('t1', a.id))?.status).toBe(
      QuotationStatus.Expired,
    );
    expect((await repo.findById('t1', b.id))?.status).toBe(
      QuotationStatus.Sent,
    );
    expect(outbox.rows.at(-1)?.event).toMatchObject({
      type: 'quotation.expired.v1',
      actor: 'system',
    });
  });
});
