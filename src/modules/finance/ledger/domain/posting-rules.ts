import { AccountKey, type KeyedLine } from './account-mapping';

/**
 * T-351 posting rules, one pure function per sub-ledger event. Each
 * returns key-based lines; the ledger compacts (drops zeros) and maps
 * them to accounts. Amounts are the sub-ledger's minor units.
 */

function cashKey(method: string): AccountKey {
  return method === 'CASH' ? AccountKey.Cash : AccountKey.Bank;
}
function dr(
  accountKey: AccountKey,
  amount: bigint,
  party?: { readonly partyType: string; readonly partyId: string },
): KeyedLine {
  return { accountKey, debitMinor: amount, creditMinor: 0n, ...party };
}
function cr(
  accountKey: AccountKey,
  amount: bigint,
  party?: { readonly partyType: string; readonly partyId: string },
): KeyedLine {
  return { accountKey, debitMinor: 0n, creditMinor: amount, ...party };
}

export interface ArInvoiceFacts {
  readonly kind: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  readonly customerId: string;
  /** subtotal − discount (revenue). */
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}
/** Invoice / debit note: Dr AR; Cr revenue, Cr output VAT. Credit note mirrors. */
export function arInvoiceLines(f: ArInvoiceFacts): KeyedLine[] {
  const party = { partyType: 'CUSTOMER', partyId: f.customerId };
  if (f.kind === 'CREDIT_NOTE') {
    return [
      dr(AccountKey.SalesRevenue, f.netMinor),
      dr(AccountKey.OutputVat, f.taxMinor),
      cr(AccountKey.ArControl, f.totalMinor, party),
    ];
  }
  return [
    dr(AccountKey.ArControl, f.totalMinor, party),
    cr(AccountKey.SalesRevenue, f.netMinor),
    cr(AccountKey.OutputVat, f.taxMinor),
  ];
}

export interface ArReceiptFacts {
  readonly customerId: string;
  readonly method: string;
  /** Cash actually received. */
  readonly amountMinor: bigint;
  /** Tax the customer withheld (prepaid income tax asset). */
  readonly whtMinor: bigint;
}
export function arReceiptLines(f: ArReceiptFacts): KeyedLine[] {
  const party = { partyType: 'CUSTOMER', partyId: f.customerId };
  return [
    dr(cashKey(f.method), f.amountMinor),
    dr(AccountKey.WhtReceivable, f.whtMinor),
    cr(AccountKey.ArControl, f.amountMinor + f.whtMinor, party),
  ];
}

export interface ApInvoiceFacts {
  readonly vendorId: string;
  /** PO-backed invoices clear GRNI (stock already debited at receipt). */
  readonly hasPurchaseOrder: boolean;
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}
export function apInvoiceLines(f: ApInvoiceFacts): KeyedLine[] {
  const party = { partyType: 'VENDOR', partyId: f.vendorId };
  return [
    dr(
      f.hasPurchaseOrder ? AccountKey.Grni : AccountKey.PurchaseExpense,
      f.netMinor,
    ),
    dr(AccountKey.InputVat, f.taxMinor),
    cr(AccountKey.ApControl, f.totalMinor, party),
  ];
}

export interface ApPaymentFacts {
  readonly vendorId: string;
  readonly method: string;
  readonly grossMinor: bigint;
  readonly whtMinor: bigint;
  readonly netPaidMinor: bigint;
}
export function apPaymentLines(f: ApPaymentFacts): KeyedLine[] {
  const party = { partyType: 'VENDOR', partyId: f.vendorId };
  return [
    dr(AccountKey.ApControl, f.grossMinor, party),
    cr(AccountKey.WhtPayable, f.whtMinor),
    cr(cashKey(f.method), f.netPaidMinor),
  ];
}

export interface InventoryMovementFacts {
  readonly movementType: string;
  readonly costMinor: bigint;
}
/**
 * Receipts capitalise stock against GRNI (cleared by the vendor invoice);
 * issues expense it to COGS; adjustments hit the adjustment account.
 * Transfers and reservations move nothing in the GL.
 */
export function inventoryMovementLines(f: InventoryMovementFacts): KeyedLine[] {
  if (f.costMinor <= 0n) return [];
  switch (f.movementType) {
    case 'RECEIPT':
      return [
        dr(AccountKey.Inventory, f.costMinor),
        cr(AccountKey.Grni, f.costMinor),
      ];
    case 'ISSUE':
      return [
        dr(AccountKey.Cogs, f.costMinor),
        cr(AccountKey.Inventory, f.costMinor),
      ];
    case 'ADJUST_IN':
      return [
        dr(AccountKey.Inventory, f.costMinor),
        cr(AccountKey.InventoryAdjustment, f.costMinor),
      ];
    case 'ADJUST_OUT':
      return [
        dr(AccountKey.InventoryAdjustment, f.costMinor),
        cr(AccountKey.Inventory, f.costMinor),
      ];
    default:
      return [];
  }
}
