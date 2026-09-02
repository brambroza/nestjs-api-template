import { ThaiTaxId } from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

export class DuplicateCompanyCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_COMPANY_CODE';
  constructor(readonly companyCode: string) {
    super(`Company code "${companyCode}" already exists in this tenant`);
  }
}

export class CompanyNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.COMPANY_NOT_FOUND';
  constructor(readonly companyId: string) {
    super(`Company ${companyId} not found`);
  }
}

export class InvalidCompanyFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_COMPANY_FIELD';
}

export interface CompanySnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly baseCurrency: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCompanyProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly legalName?: string | null;
  readonly taxId?: string | null;
  readonly baseCurrency?: string | null;
  readonly now: Date;
}

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set([
  'THB',
  'USD',
  'JPY',
]);

/**
 * A legal entity under a tenant. `legalName` defaults to `name` when
 * omitted — most SMEs use one string for both; groups override it with
 * the registered name that must appear on tax invoices.
 */
export class Company {
  private constructor(private readonly s: CompanySnapshot) {}

  static create(props: CreateCompanyProps): Company {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidCompanyFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidCompanyFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const legalName = (props.legalName ?? '').trim() || name;
    if (legalName.length > 200) {
      throw new InvalidCompanyFieldError('legalName must be <= 200 characters');
    }
    const taxId = ThaiTaxId.tryOf(props.taxId);
    const currency = (props.baseCurrency ?? 'THB').trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new InvalidCompanyFieldError(
        `baseCurrency must be one of ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      );
    }
    return new Company({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      legalName,
      taxId: taxId?.value ?? null,
      baseCurrency: currency,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: CompanySnapshot): Company {
    return new Company(s);
  }

  snapshot(): CompanySnapshot {
    return this.s;
  }
}
