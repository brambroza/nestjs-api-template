/**
 * Public surface of the general ledger. AR, AP and inventory import
 * from HERE (`../ledger` / `../finance/ledger`) and nowhere deeper —
 * dependency-cruiser forbids reaching into ledger/domain|application.
 */
export { LedgerModule } from './ledger.module';
export {
  LEDGER_POSTING,
  type LedgerPostRequest,
  type LedgerPostResult,
  type LedgerPostingGateway,
  type LedgerReverseRequest,
} from './application/ledger-posting.gateway';
export {
  AccountKey,
  AccountMappingMissingError,
  JournalSourceType,
  apInvoiceLines,
  apPaymentLines,
  arInvoiceLines,
  arReceiptLines,
  compactKeyedLines,
  inventoryMovementLines,
  type ApInvoiceFacts,
  type ApPaymentFacts,
  type ArInvoiceFacts,
  type ArReceiptFacts,
  type InventoryMovementFacts,
  type KeyedLine,
} from './domain';
