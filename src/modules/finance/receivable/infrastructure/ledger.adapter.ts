import { Inject, Injectable } from '@nestjs/common';

import type { IsoDate } from '../../../../shared/domain';
import {
  JournalSourceType,
  LEDGER_POSTING,
  arInvoiceLines,
  arReceiptLines,
  type LedgerPostingGateway,
} from '../../ledger';
import type { Receipt, SalesInvoice } from '../domain';
import type { ArLedger } from '../application/ports';

const LABEL: Record<string, string> = {
  INVOICE: 'Tax invoice',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
};

/** T-351: AR → GL through the ledger gateway (same transaction, idempotent keys). */
@Injectable()
export class LedgerArAdapter implements ArLedger {
  constructor(
    @Inject(LEDGER_POSTING) private readonly ledger: LedgerPostingGateway,
  ) {}

  async invoiceIssued(inv: SalesInvoice): Promise<void> {
    const s = inv.snapshot();
    await this.ledger.post({
      companyId: s.companyId,
      entryDate: s.invoiceDate,
      currency: s.currency,
      sourceType: JournalSourceType.ArInvoice,
      sourceId: s.id,
      sourceKey: `ar-invoice:${s.id}:issued`,
      description: `${LABEL[s.type] ?? s.type} ${s.number ?? s.id} — ${s.customerName}`,
      lines: arInvoiceLines({
        kind: s.type,
        customerId: s.customerId,
        netMinor: s.subtotalMinor - s.discountMinor,
        taxMinor: s.taxMinor,
        totalMinor: s.totalMinor,
      }),
    });
  }

  async invoiceVoided(inv: SalesInvoice, date: IsoDate): Promise<void> {
    const s = inv.snapshot();
    await this.ledger.reverse({
      sourceType: JournalSourceType.ArInvoice,
      sourceId: s.id,
      entryDate: date,
      sourceKey: `ar-invoice:${s.id}:voided`,
      description: `Void ${LABEL[s.type] ?? s.type} ${s.number ?? s.id}`,
    });
  }

  async receiptPosted(r: Receipt): Promise<void> {
    const s = r.snapshot();
    await this.ledger.post({
      companyId: s.companyId,
      entryDate: s.receiptDate,
      currency: s.currency,
      sourceType: JournalSourceType.ArReceipt,
      sourceId: s.id,
      sourceKey: `ar-receipt:${s.id}:posted`,
      description: `Receipt ${s.number}`,
      lines: arReceiptLines({
        customerId: s.customerId,
        method: s.method,
        amountMinor: s.amountMinor,
        whtMinor: s.whtMinor,
      }),
    });
  }

  async receiptVoided(r: Receipt, date: IsoDate): Promise<void> {
    const s = r.snapshot();
    await this.ledger.reverse({
      sourceType: JournalSourceType.ArReceipt,
      sourceId: s.id,
      entryDate: date,
      sourceKey: `ar-receipt:${s.id}:voided`,
      description: `Void receipt ${s.number}`,
    });
  }
}
