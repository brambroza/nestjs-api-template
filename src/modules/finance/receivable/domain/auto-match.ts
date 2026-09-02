import type { IsoDate } from '../../../../shared/domain';

export interface OpenInvoiceRef {
  readonly invoiceId: string;
  readonly number: string | null;
  readonly dueDate: IsoDate;
  readonly balanceMinor: bigint;
}

export interface MatchProposal {
  readonly allocations: ReadonlyArray<{
    readonly invoiceId: string;
    readonly amountMinor: bigint;
    readonly rule: 'REFERENCE' | 'EXACT_AMOUNT' | 'FIFO';
  }>;
  readonly unappliedMinor: bigint;
}

/**
 * T-336. 1) an invoice number quoted in the bank reference wins;
 * 2) a single open invoice whose balance equals the remaining amount;
 * 3) oldest due first until the money runs out. Pure.
 */
export function proposeAllocations(
  settlementMinor: bigint,
  reference: string | null,
  open: readonly OpenInvoiceRef[],
): MatchProposal {
  const allocations: Array<{
    invoiceId: string;
    amountMinor: bigint;
    rule: 'REFERENCE' | 'EXACT_AMOUNT' | 'FIFO';
  }> = [];
  const used = new Set<string>();
  let remaining = settlementMinor;
  const ref = (reference ?? '').toUpperCase();
  const take = (
    inv: OpenInvoiceRef,
    rule: 'REFERENCE' | 'EXACT_AMOUNT' | 'FIFO',
  ): void => {
    if (remaining <= 0n || used.has(inv.invoiceId) || inv.balanceMinor <= 0n)
      return;
    const amount = inv.balanceMinor < remaining ? inv.balanceMinor : remaining;
    allocations.push({ invoiceId: inv.invoiceId, amountMinor: amount, rule });
    used.add(inv.invoiceId);
    remaining -= amount;
  };
  if (ref.length > 0) {
    for (const inv of open) {
      if (inv.number && ref.includes(inv.number.toUpperCase()))
        take(inv, 'REFERENCE');
    }
  }
  if (remaining > 0n) {
    const exact = open.filter(
      (i) => !used.has(i.invoiceId) && i.balanceMinor === remaining,
    );
    if (exact.length === 1 && exact[0]) take(exact[0], 'EXACT_AMOUNT');
  }
  if (remaining > 0n) {
    for (const inv of [...open].sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
    )) {
      take(inv, 'FIFO');
    }
  }
  return { allocations, unappliedMinor: remaining };
}
