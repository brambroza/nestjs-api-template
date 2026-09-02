/**
 * Public surface of sales/shared. Sibling sub-modules (quotation,
 * sales-order) import from HERE and never from application/ or
 * infrastructure/ — dependency-cruiser enforces it.
 */
export { SalesSharedModule } from './sales-shared.module';
export { CurrencyMismatchError, SalesRefInvalidError } from './domain';
export {
  DOCUMENT_PRICING,
  SALES_REF_LOOKUP,
  priceLines,
  type CompanyRef,
  type CustomerRef,
  type DocumentPricing,
  type ItemRef,
  type LineRequest,
  type PriceLookupInput,
  type PriceLookupResult,
  type PricingContext,
  type SalesRefLookup,
  type VatLookupResult,
} from './application';
