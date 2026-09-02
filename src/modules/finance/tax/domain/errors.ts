import { DomainError } from '../../../../shared/errors';

export class TaxRefInvalidError extends DomainError {
  readonly code = 'TAX.REF_INVALID';
}
export class InvalidTaxPeriodError extends DomainError {
  readonly code = 'TAX.INVALID_PERIOD';
  constructor(readonly value: string) {
    super(`tax period must be YYYY-MM, got "${value}"`);
  }
}
