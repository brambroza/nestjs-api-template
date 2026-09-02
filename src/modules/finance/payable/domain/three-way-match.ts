/**
 * T-340 three-way match: invoice line vs purchase-order line vs goods
 * receipts. Pure. Price tolerance in basis points of the PO price
 * (default 1 %); quantity may never exceed what was received and not
 * yet invoiced.
 */
export const MatchStatus = {
  Matched: 'MATCHED',
  Variance: 'VARIANCE',
  Unmatched: 'UNMATCHED',
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];
export function isMatchStatus(v: string): v is MatchStatus {
  return (Object.values(MatchStatus) as string[]).includes(v);
}

export const DEFAULT_PRICE_TOLERANCE_BP = 100;

export interface MatchLineInput {
  readonly lineRef: string;
  readonly invoicedQty: bigint;
  readonly invoicedUnitPriceMinor: bigint;
  /** null when the line is not tied to a PO line. */
  readonly po: {
    readonly orderedQty: bigint;
    readonly unitPriceMinor: bigint;
    readonly receivedQty: bigint;
    readonly alreadyInvoicedQty: bigint;
  } | null;
}

export interface MatchResult {
  readonly status: MatchStatus;
  readonly issues: readonly string[];
}

export function threeWayMatch(
  lines: readonly MatchLineInput[],
  priceToleranceBp = DEFAULT_PRICE_TOLERANCE_BP,
): MatchResult {
  const issues: string[] = [];
  let anyPo = false;
  for (const l of lines) {
    if (!l.po) continue;
    anyPo = true;
    const openQty = l.po.receivedQty - l.po.alreadyInvoicedQty;
    if (l.invoicedQty > openQty) {
      issues.push(
        `${l.lineRef}: invoiced ${l.invoicedQty.toString()} but only ${openQty.toString()} received and un-invoiced`,
      );
    }
    const diff = l.invoicedUnitPriceMinor - l.po.unitPriceMinor;
    const abs = diff < 0n ? -diff : diff;
    const allowed = (l.po.unitPriceMinor * BigInt(priceToleranceBp)) / 10_000n;
    if (abs > allowed) {
      issues.push(
        `${l.lineRef}: price ${l.invoicedUnitPriceMinor.toString()} vs PO ${l.po.unitPriceMinor.toString()} (tolerance ${allowed.toString()})`,
      );
    }
  }
  if (!anyPo)
    return {
      status: MatchStatus.Unmatched,
      issues: ['no purchase order lines referenced'],
    };
  return {
    status: issues.length === 0 ? MatchStatus.Matched : MatchStatus.Variance,
    issues,
  };
}
