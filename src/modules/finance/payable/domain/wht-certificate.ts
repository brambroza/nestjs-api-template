import type { IsoDate } from '../../../../shared/domain';

/**
 * T-342 หนังสือรับรองการหักภาษี ณ ที่จ่าย (data only; PDF is Phase D
 * template work). One per posted voucher with WHT; lines grouped by tax
 * code. PND53 for juristic payees, PND3 for individuals — decided by
 * the WHT tax code's pndForm (T-131).
 */
export interface WhtCertificateLineSnapshot {
  readonly id: string;
  readonly lineNo: number;
  readonly taxCode: string;
  readonly incomeType: string;
  readonly rateBp: number;
  readonly baseMinor: bigint;
  readonly taxMinor: bigint;
}

export interface WhtCertificateSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly voucherId: string;
  readonly number: string;
  readonly pndForm: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly vendorTaxId: string | null;
  readonly paymentDate: IsoDate;
  readonly totalBaseMinor: bigint;
  readonly totalTaxMinor: bigint;
  readonly isVoid: boolean;
  readonly lines: readonly WhtCertificateLineSnapshot[];
  readonly createdAt: Date;
}

export interface WhtLineInput {
  readonly taxCode: string;
  readonly incomeType: string;
  readonly rateBp: number;
  readonly pndForm: string;
  readonly baseMinor: bigint;
  readonly taxMinor: bigint;
}

/** Merges per-invoice WHT lines of a voucher by tax code; the form is the majority (first) form. */
export function buildCertificateLines(
  inputs: readonly WhtLineInput[],
  newId: () => string,
): {
  readonly lines: WhtCertificateLineSnapshot[];
  readonly pndForm: string;
  readonly totalBaseMinor: bigint;
  readonly totalTaxMinor: bigint;
} {
  const groups = new Map<string, WhtLineInput>();
  for (const i of inputs) {
    if (i.taxMinor <= 0n) continue;
    const g = groups.get(i.taxCode);
    groups.set(
      i.taxCode,
      g
        ? {
            ...g,
            baseMinor: g.baseMinor + i.baseMinor,
            taxMinor: g.taxMinor + i.taxMinor,
          }
        : i,
    );
  }
  const lines = [...groups.values()].map((g, i) => ({
    id: newId(),
    lineNo: i + 1,
    taxCode: g.taxCode,
    incomeType: g.incomeType,
    rateBp: g.rateBp,
    baseMinor: g.baseMinor,
    taxMinor: g.taxMinor,
  }));
  return {
    lines,
    pndForm: inputs.find((i) => i.taxMinor > 0n)?.pndForm ?? 'PND53',
    totalBaseMinor: lines.reduce((s, l) => s + l.baseMinor, 0n),
    totalTaxMinor: lines.reduce((s, l) => s + l.taxMinor, 0n),
  };
}
