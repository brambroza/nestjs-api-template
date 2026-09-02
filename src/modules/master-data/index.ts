/**
 * Public surface of master-data for the document modules (sales,
 * purchase). They import from HERE (`../../master-data`) and never
 * from a sub-module's domain/application/infrastructure —
 * dependency-cruiser enforces it. Everything exported is a Nest
 * provider exported by MasterDataModule, or a type.
 */
export { MasterDataModule } from './master-data.module';
export {
  ResolvePriceUseCase,
  type ResolvePriceInput,
  type ResolvedPrice,
} from './price-list/application';
export {
  CheckPostingDateUseCase,
  ConvertAmountUseCase,
  GetFxRateUseCase,
  ResolveTaxUseCase,
  type CheckPostingDateInput,
  type ConvertAmountInput,
  type ConvertedAmount,
  type ResolveTaxInput,
  type ResolvedTax,
} from './finance/application';
export { TaxKind } from './finance/domain';
