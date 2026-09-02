import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { toIsoDate, type IsoDate } from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { buildAging, type AgingRow } from '../domain';

import {
  RECEIPT_REPOSITORY,
  SALES_INVOICE_REPOSITORY,
  type ReceiptRepository,
  type SalesInvoiceRepository,
} from './ports';

/** T-335 aging by customer. Balances are the current open balances of invoices dated on or before asOf. */
@Injectable()
export class ArAgingUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: {
    asOf?: IsoDate | null;
    customerId?: string | null;
  }): Promise<{ asOf: IsoDate; rows: AgingRow[]; totalMinor: bigint }> {
    const asOf = input.asOf ?? toIsoDate(this.clock.now());
    const open = await this.invoices.listOpen(
      this.tenant.getTenantId(),
      input.customerId ?? null,
    );
    const rows = buildAging(
      open
        .filter((i) => i.snapshot().invoiceDate <= asOf)
        .map((i) => ({
          customerId: i.snapshot().customerId,
          invoiceId: i.id,
          number: i.snapshot().number,
          dueDate: i.snapshot().dueDate,
          balanceMinor: i.snapshot().balanceMinor,
        })),
      asOf,
    );
    return {
      asOf,
      rows,
      totalMinor: rows.reduce((s, r) => s + r.totalMinor, 0n),
    };
  }
}

export interface StatementLine {
  readonly date: IsoDate;
  readonly kind: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'RECEIPT';
  readonly documentId: string;
  readonly number: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly runningBalanceMinor: bigint;
}

/** T-337 customer statement: chronological debits (invoices/DN) and credits (CN/receipts) with a running balance. */
@Injectable()
export class CustomerStatementUseCase {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY)
    private readonly invoices: SalesInvoiceRepository,
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: {
    customerId: string;
    from: IsoDate;
    to: IsoDate;
  }): Promise<{ lines: StatementLine[]; closingBalanceMinor: bigint }> {
    const tenantId = this.tenant.getTenantId();
    const [invoices, receipts] = await Promise.all([
      this.invoices.listForStatement(
        tenantId,
        input.customerId,
        input.from,
        input.to,
      ),
      this.receipts.listForStatement(
        tenantId,
        input.customerId,
        input.from,
        input.to,
      ),
    ]);
    const entries: Array<Omit<StatementLine, 'runningBalanceMinor'>> = [];
    for (const i of invoices) {
      const s = i.snapshot();
      if (!s.number || s.status === 'VOID') continue;
      const isCredit = s.type === 'CREDIT_NOTE';
      entries.push({
        date: s.invoiceDate,
        kind: s.type,
        documentId: s.id,
        number: s.number,
        debitMinor: isCredit ? 0n : s.totalMinor,
        creditMinor: isCredit ? s.totalMinor : 0n,
      });
    }
    for (const r of receipts) {
      const s = r.snapshot();
      if (s.status !== 'POSTED') continue;
      entries.push({
        date: s.receiptDate,
        kind: 'RECEIPT',
        documentId: s.id,
        number: s.number,
        debitMinor: 0n,
        creditMinor: r.settlementMinor,
      });
    }
    // Same day: debits before the credits that settle them, then by number.
    const rank = {
      INVOICE: 0,
      DEBIT_NOTE: 1,
      CREDIT_NOTE: 2,
      RECEIPT: 3,
    } as const;
    entries.sort((a, b) =>
      a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : rank[a.kind] - rank[b.kind] || a.number.localeCompare(b.number),
    );
    let running = 0n;
    const lines = entries.map((e) => {
      running += e.debitMinor - e.creditMinor;
      return { ...e, runningBalanceMinor: running };
    });
    return { lines, closingBalanceMinor: running };
  }
}
