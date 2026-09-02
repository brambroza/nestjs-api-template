import { DomainError } from '../../../../shared/errors';

export class SalesRefInvalidError extends DomainError {
  readonly code = 'SALES.REF_INVALID';
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'SALES.CURRENCY_MISMATCH';
  constructor(
    readonly documentCurrency: string,
    readonly priceCurrency: string,
    readonly itemId: string,
  ) {
    super(
      `Item ${itemId} is priced in ${priceCurrency} but the document is in ${documentCurrency}`,
    );
  }
}
