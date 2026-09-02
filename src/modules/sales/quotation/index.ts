/**
 * Public surface of the quotation module. The sales-order module
 * imports from HERE (`../quotation`) and nowhere deeper.
 */
export { QuotationModule } from './quotation.module';
export {
  QUOTATION_CONVERSION,
  type ConvertibleQuotation,
  type QuotationConversion,
} from './application/quotation-conversion.gateway';
export { QuotationStatus } from './domain';
