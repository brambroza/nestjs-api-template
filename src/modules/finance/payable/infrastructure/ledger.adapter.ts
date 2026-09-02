import { Inject, Injectable } from '@nestjs/common';

import type { IsoDate } from '../../../../shared/domain';
import {
  JournalSourceType,
  LEDGER_POSTING,
  apInvoiceLines,
  apPaymentLines,
  type LedgerPostingGateway,
} from '../../ledger';
import type { PaymentVoucher, VendorInvoice } from '../domain';
import type { ApLedger } from '../application/ports';

/** T-351: AP → GL through the ledger gateway (same transaction, idempotent keys). */
@Injectable()
export class LedgerApAdapter implements ApLedger {
  constructor(
    @Inject(LEDGER_POSTING) private readonly ledger: LedgerPostingGateway,
  ) {}

  async invoicePosted(inv: VendorInvoice): Promise<void> {
    const s = inv.snapshot();
    await this.ledger.post({
      companyId: s.companyId,
      entryDate: s.invoiceDate,
      currency: s.currency,
      sourceType: JournalSourceType.ApInvoice,
      sourceId: s.id,
      sourceKey: `ap-invoice:${s.id}:posted`,
      description: `Vendor invoice ${s.number} (${s.vendorInvoiceNumber}) — ${s.vendorName}`,
      lines: apInvoiceLines({
        vendorId: s.vendorId,
        hasPurchaseOrder: s.purchaseOrderId !== null,
        netMinor: s.subtotalMinor - s.discountMinor,
        taxMinor: s.taxMinor,
        totalMinor: s.totalMinor,
      }),
    });
  }

  async invoiceVoided(inv: VendorInvoice, date: IsoDate): Promise<void> {
    const s = inv.snapshot();
    await this.ledger.reverse({
      sourceType: JournalSourceType.ApInvoice,
      sourceId: s.id,
      entryDate: date,
      sourceKey: `ap-invoice:${s.id}:voided`,
      description: `Void vendor invoice ${s.number}`,
    });
  }

  async paymentPosted(v: PaymentVoucher): Promise<void> {
    const s = v.snapshot();
    await this.ledger.post({
      companyId: s.companyId,
      entryDate: s.paymentDate,
      currency: s.currency,
      sourceType: JournalSourceType.ApPayment,
      sourceId: s.id,
      sourceKey: `ap-payment:${s.id}:posted`,
      description: `Payment voucher ${s.number}`,
      lines: apPaymentLines({
        vendorId: s.vendorId,
        method: s.method,
        grossMinor: s.grossMinor,
        whtMinor: s.whtMinor,
        netPaidMinor: s.netPaidMinor,
      }),
    });
  }

  async paymentVoided(v: PaymentVoucher, date: IsoDate): Promise<void> {
    const s = v.snapshot();
    await this.ledger.reverse({
      sourceType: JournalSourceType.ApPayment,
      sourceId: s.id,
      entryDate: date,
      sourceKey: `ap-payment:${s.id}:voided`,
      description: `Void payment voucher ${s.number}`,
    });
  }
}
