import { AccountMappingMissingError } from './errors';
import type { JournalLineInput } from './journal-entry';

/**
 * Posting keys (T-351). Sub-ledgers post against keys; the ledger resolves
 * them to the company's chart of accounts through fin_account_mapping, so
 * AR/AP/inventory never learn account codes.
 */
export const AccountKey = {
  ArControl: 'AR_CONTROL',
  ApControl: 'AP_CONTROL',
  OutputVat: 'OUTPUT_VAT',
  InputVat: 'INPUT_VAT',
  WhtPayable: 'WHT_PAYABLE',
  WhtReceivable: 'WHT_RECEIVABLE',
  SalesRevenue: 'SALES_REVENUE',
  PurchaseExpense: 'PURCHASE_EXPENSE',
  Cash: 'CASH',
  Bank: 'BANK',
  Inventory: 'INVENTORY',
  Cogs: 'COGS',
  Grni: 'GRNI',
  InventoryAdjustment: 'INVENTORY_ADJUSTMENT',
  RetainedEarnings: 'RETAINED_EARNINGS',
} as const;
export type AccountKey = (typeof AccountKey)[keyof typeof AccountKey];
export const ACCOUNT_KEYS: readonly AccountKey[] = Object.values(AccountKey);
export function isAccountKey(v: string): v is AccountKey {
  return (ACCOUNT_KEYS as readonly string[]).includes(v);
}

export interface AccountMappingSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly key: AccountKey;
  readonly accountId: string;
  readonly accountCode: string;
  readonly updatedBy: string;
  readonly updatedAt: Date;
}

/** A journal line expressed against a posting key instead of an account. */
export interface KeyedLine {
  readonly accountKey: AccountKey;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly description?: string | null;
  readonly partyType?: string | null;
  readonly partyId?: string | null;
}

/**
 * Drops zero lines and merges lines with the same key/party/description.
 * Sub-ledger rules can emit "Cr WHT 0" freely; nothing zero reaches the GL.
 */
export function compactKeyedLines(lines: readonly KeyedLine[]): KeyedLine[] {
  const merged = new Map<string, KeyedLine>();
  for (const l of lines) {
    const id = `${l.accountKey}|${l.partyType ?? ''}|${l.partyId ?? ''}|${l.description ?? ''}`;
    const prev = merged.get(id);
    merged.set(
      id,
      prev
        ? {
            ...prev,
            debitMinor: prev.debitMinor + l.debitMinor,
            creditMinor: prev.creditMinor + l.creditMinor,
          }
        : { ...l },
    );
  }
  const out: KeyedLine[] = [];
  for (const l of merged.values()) {
    const net = l.debitMinor - l.creditMinor;
    if (net === 0n) continue;
    out.push({
      ...l,
      debitMinor: net > 0n ? net : 0n,
      creditMinor: net < 0n ? -net : 0n,
    });
  }
  return out;
}

export interface MappedAccount {
  readonly accountId: string;
  readonly accountCode: string;
}

export function resolveKeyedLines(
  companyId: string,
  lines: readonly KeyedLine[],
  mappings: ReadonlyMap<string, MappedAccount>,
): JournalLineInput[] {
  return lines.map((l) => {
    const m = mappings.get(l.accountKey);
    if (!m) throw new AccountMappingMissingError(companyId, l.accountKey);
    return {
      accountId: m.accountId,
      accountCode: m.accountCode,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      description: l.description ?? null,
      partyType: l.partyType ?? null,
      partyId: l.partyId ?? null,
    };
  });
}
