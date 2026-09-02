import {
  AccountKey,
  compactKeyedLines,
  resolveKeyedLines,
} from './account-mapping';
import {
  AccountMappingMissingError,
  UnbalancedJournalEntryError,
} from './errors';
import { JournalEntry, type JournalLineInput } from './journal-entry';
import {
  apInvoiceLines,
  apPaymentLines,
  arInvoiceLines,
  arReceiptLines,
  inventoryMovementLines,
} from './posting-rules';
import {
  buildBalanceSheet,
  buildClosingLines,
  buildProfitAndLoss,
  buildTrialBalance,
  type AccountInfo,
} from './reports';

function acc(
  id: string,
  code: string,
  type: AccountInfo['type'],
  isPostable = true,
): AccountInfo {
  return {
    id,
    code,
    name: code,
    nameTh: null,
    type,
    isPostable,
    isActive: true,
  };
}
const ACCOUNTS: AccountInfo[] = [
  acc('a-ar', '1200', 'ASSET'),
  acc('a-bank', '1100', 'ASSET'),
  acc('a-vat', '2200', 'LIABILITY'),
  acc('a-re', '3200', 'EQUITY'),
  acc('a-rev', '4100', 'REVENUE'),
  acc('a-cogs', '5100', 'EXPENSE'),
  acc('a-hdr', '1000', 'ASSET', false),
];

const MAPPINGS = new Map([
  [AccountKey.ArControl, { accountId: 'a-ar', accountCode: '1200' }],
  [AccountKey.SalesRevenue, { accountId: 'a-rev', accountCode: '4100' }],
  [AccountKey.OutputVat, { accountId: 'a-vat', accountCode: '2200' }],
  [AccountKey.Bank, { accountId: 'a-bank', accountCode: '1100' }],
]);

const now = new Date('2026-09-02T03:00:00.000Z');

describe('posting rules', () => {
  it('AR invoice: Dr AR / Cr revenue + output VAT, balanced; credit note mirrors', () => {
    const lines = arInvoiceLines({
      kind: 'INVOICE',
      customerId: 'c1',
      netMinor: 10_000_00n,
      taxMinor: 700_00n,
      totalMinor: 10_700_00n,
    });
    const dr = lines.reduce((s, l) => s + l.debitMinor, 0n);
    const cr = lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(dr).toBe(cr);
    expect(lines[0]).toMatchObject({
      accountKey: 'AR_CONTROL',
      debitMinor: 10_700_00n,
      partyId: 'c1',
    });
    const cn = arInvoiceLines({
      kind: 'CREDIT_NOTE',
      customerId: 'c1',
      netMinor: 1_000_00n,
      taxMinor: 70_00n,
      totalMinor: 1_070_00n,
    });
    expect(cn[2]).toMatchObject({
      accountKey: 'AR_CONTROL',
      creditMinor: 1_070_00n,
    });
  });

  it('receipt with WHT settles AR by cash + WHT; zero lines are compacted away', () => {
    const lines = compactKeyedLines(
      arReceiptLines({
        customerId: 'c1',
        method: 'TRANSFER',
        amountMinor: 9_700_00n,
        whtMinor: 300_00n,
      }),
    );
    expect(lines.map((l) => l.accountKey)).toEqual([
      'BANK',
      'WHT_RECEIVABLE',
      'AR_CONTROL',
    ]);
    const noWht = compactKeyedLines(
      arReceiptLines({
        customerId: 'c1',
        method: 'CASH',
        amountMinor: 100n,
        whtMinor: 0n,
      }),
    );
    expect(noWht.map((l) => l.accountKey)).toEqual(['CASH', 'AR_CONTROL']);
  });

  it('AP invoice with PO clears GRNI; payment splits WHT payable from bank', () => {
    const withPo = apInvoiceLines({
      vendorId: 'v',
      hasPurchaseOrder: true,
      netMinor: 100n,
      taxMinor: 7n,
      totalMinor: 107n,
    });
    expect(withPo[0]?.accountKey).toBe('GRNI');
    const noPo = apInvoiceLines({
      vendorId: 'v',
      hasPurchaseOrder: false,
      netMinor: 100n,
      taxMinor: 7n,
      totalMinor: 107n,
    });
    expect(noPo[0]?.accountKey).toBe('PURCHASE_EXPENSE');
    const pay = apPaymentLines({
      vendorId: 'v',
      method: 'TRANSFER',
      grossMinor: 107n,
      whtMinor: 3n,
      netPaidMinor: 104n,
    });
    expect(pay.map((l) => [l.accountKey, l.debitMinor, l.creditMinor])).toEqual(
      [
        ['AP_CONTROL', 107n, 0n],
        ['WHT_PAYABLE', 0n, 3n],
        ['BANK', 0n, 104n],
      ],
    );
  });

  it('inventory: receipt capitalises, issue expenses, transfers post nothing', () => {
    const keys = (t: string, cost: bigint) =>
      inventoryMovementLines({ movementType: t, costMinor: cost }).map(
        (l) => l.accountKey,
      );
    expect(keys('RECEIPT', 50n)).toEqual(['INVENTORY', 'GRNI']);
    expect(keys('ISSUE', 50n)).toEqual(['COGS', 'INVENTORY']);
    expect(keys('ADJUST_OUT', 50n)).toEqual([
      'INVENTORY_ADJUSTMENT',
      'INVENTORY',
    ]);
    expect(keys('TRANSFER_OUT', 50n)).toEqual([]);
    expect(keys('ISSUE', 0n)).toEqual([]);
  });

  it('resolveKeyedLines fails loudly on a missing mapping', () => {
    expect(() =>
      resolveKeyedLines(
        'co',
        [{ accountKey: AccountKey.Cogs, debitMinor: 1n, creditMinor: 0n }],
        MAPPINGS,
      ),
    ).toThrow(AccountMappingMissingError);
  });
});

describe('JournalEntry', () => {
  const lines = resolveKeyedLines(
    'co',
    arInvoiceLines({
      kind: 'INVOICE',
      customerId: 'c1',
      netMinor: 100n,
      taxMinor: 7n,
      totalMinor: 107n,
    }),
    MAPPINGS,
  );
  const create = (ls: readonly JournalLineInput[] = lines) =>
    JournalEntry.create({
      id: 'je1',
      tenantId: 't1',
      companyId: 'co',
      number: 'JV-202609-0001',
      entryDate: '2026-09-02',
      description: 'test',
      sourceType: 'MANUAL',
      currency: 'THB',
      createdBy: 'alice',
      lines: ls,
      lineIds: ls.map((_, i) => `l${String(i)}`),
      now,
    });
  const patchFirst = (patch: Partial<JournalLineInput>) =>
    lines.map((l, i) => (i === 0 ? { ...l, ...patch } : l));

  it('rejects unbalanced and two-sided lines', () => {
    expect(() => create(patchFirst({ debitMinor: 5n }))).toThrow(
      UnbalancedJournalEntryError,
    );
    expect(() => create(patchFirst({ creditMinor: 1n }))).toThrow(
      /either a debit or a credit/,
    );
  });

  it('DRAFT → PENDING_APPROVAL → POSTED → REVERSED; reversal lines mirror', () => {
    const posted = create().submit('req', now).post('bob', now);
    expect(posted.status).toBe('POSTED');
    expect(posted.snapshot().totalDebitMinor).toBe(107n);
    const rev = posted.reversalLines();
    expect(rev[0]).toMatchObject({
      accountCode: '1200',
      debitMinor: 0n,
      creditMinor: 107n,
    });
    expect(posted.markReversed('je2', now).status).toBe('REVERSED');
    expect(() => posted.void(now)).toThrow(/POSTED -> VOID/);
  });
});

describe('reports', () => {
  const opening = [
    { accountId: 'a-bank', debitMinor: 1_000n, creditMinor: 0n },
    { accountId: 'a-re', debitMinor: 0n, creditMinor: 1_000n },
  ];
  const period = [
    { accountId: 'a-ar', debitMinor: 107n, creditMinor: 0n },
    { accountId: 'a-rev', debitMinor: 0n, creditMinor: 100n },
    { accountId: 'a-vat', debitMinor: 0n, creditMinor: 7n },
    { accountId: 'a-cogs', debitMinor: 40n, creditMinor: 0n },
    { accountId: 'a-bank', debitMinor: 0n, creditMinor: 40n },
  ];

  it('trial balance carries opening balances and balances', () => {
    const tb = buildTrialBalance(
      '2026-09-01',
      '2026-09-30',
      ACCOUNTS,
      opening,
      period,
    );
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.code === '1100')).toMatchObject({
      openingMinor: 1_000n,
      creditMinor: 40n,
      closingMinor: 960n,
    });
    expect(tb.rows.find((r) => r.code === '3200')?.closingMinor).toBe(-1_000n);
    expect(tb.rows.some((r) => r.code === '1000')).toBe(false);
  });

  it('P&L nets revenue against expenses; balance sheet balances with current earnings', () => {
    const pl = buildProfitAndLoss('2026-09-01', '2026-09-30', ACCOUNTS, period);
    expect(pl.netProfitMinor).toBe(60n);
    const bs = buildBalanceSheet('2026-09-30', ACCOUNTS, [
      ...opening,
      ...period,
    ]);
    expect(bs.totalAssetsMinor).toBe(1_067n);
    expect(bs.currentEarningsMinor).toBe(60n);
    expect(bs.balanced).toBe(true);
  });

  it('closing lines zero P&L accounts into retained earnings', () => {
    const re = { accountId: 'a-re', accountCode: '3200' };
    const lines = buildClosingLines(ACCOUNTS, period, re);
    expect(
      lines.map((l) => [l.accountCode, l.debitMinor, l.creditMinor]),
    ).toEqual([
      ['4100', 100n, 0n],
      ['5100', 0n, 40n],
      ['3200', 0n, 60n],
    ]);
    expect(buildClosingLines(ACCOUNTS, opening, re)).toEqual([]);
  });
});
