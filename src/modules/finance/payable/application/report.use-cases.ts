import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import {
  addDays,
  buildAging,
  toIsoDate,
  type AgingRow,
  type IsoDate,
} from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';

import {
  VENDOR_INVOICE_REPOSITORY,
  type VendorInvoiceRepository,
} from './ports';

/** T-345 AP aging per vendor by days past due. */
@Injectable()
export class ApAgingUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly invoices: VendorInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: {
    asOf?: IsoDate | null;
    vendorId?: string | null;
  }): Promise<{ asOf: IsoDate; rows: AgingRow[]; totalMinor: bigint }> {
    const asOf = input.asOf ?? toIsoDate(this.clock.now());
    const open = await this.invoices.listOpen(
      this.tenant.getTenantId(),
      input.vendorId ?? null,
      null,
    );
    const rows = buildAging(
      open
        .filter((i) => i.snapshot().invoiceDate <= asOf)
        .map((i) => ({
          partyId: i.snapshot().vendorId,
          documentId: i.id,
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

export interface CashForecastBucket {
  readonly label: string;
  readonly from: IsoDate;
  readonly to: IsoDate | null;
  readonly amountMinor: bigint;
  readonly invoices: number;
}

/** T-345 cash forecast: open payables by due week (overdue, this week … 4 weeks, later). */
@Injectable()
export class CashForecastUseCase {
  constructor(
    @Inject(VENDOR_INVOICE_REPOSITORY)
    private readonly invoices: VendorInvoiceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(input: {
    asOf?: IsoDate | null;
    weeks?: number | null;
  }): Promise<{
    asOf: IsoDate;
    buckets: CashForecastBucket[];
    totalMinor: bigint;
  }> {
    const asOf = input.asOf ?? toIsoDate(this.clock.now());
    const weeks = Math.max(1, Math.min(12, input.weeks ?? 4));
    const open = await this.invoices.listOpen(
      this.tenant.getTenantId(),
      null,
      null,
    );
    const buckets: Array<{
      label: string;
      from: IsoDate;
      to: IsoDate | null;
      amountMinor: bigint;
      invoices: number;
    }> = [
      {
        label: 'OVERDUE',
        from: '0000-01-01',
        to: addDays(asOf, -1),
        amountMinor: 0n,
        invoices: 0,
      },
    ];
    for (let w = 0; w < weeks; w += 1) {
      buckets.push({
        label: `WEEK_${String(w + 1)}`,
        from: addDays(asOf, w * 7),
        to: addDays(asOf, w * 7 + 6),
        amountMinor: 0n,
        invoices: 0,
      });
    }
    buckets.push({
      label: 'LATER',
      from: addDays(asOf, weeks * 7),
      to: null,
      amountMinor: 0n,
      invoices: 0,
    });
    for (const inv of open) {
      const due = inv.snapshot().dueDate;
      const b = buckets.find(
        (x) => due >= x.from && (x.to === null || due <= x.to),
      );
      if (!b) continue;
      b.amountMinor += inv.snapshot().balanceMinor;
      b.invoices += 1;
    }
    return {
      asOf,
      buckets,
      totalMinor: buckets.reduce((s, b) => s + b.amountMinor, 0n),
    };
  }
}
