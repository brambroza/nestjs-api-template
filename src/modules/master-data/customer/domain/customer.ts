import { DomainError } from '../../../../shared/errors';

export class DuplicateCustomerCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_CUSTOMER_CODE';
  constructor(readonly customerCode: string) {
    super(`Customer code "${customerCode}" already exists in this tenant`);
  }
}

export class CustomerNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.CUSTOMER_NOT_FOUND';
  constructor(readonly customerId: string) {
    super(`Customer ${customerId} not found`);
  }
}

export class InvalidCustomerFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_CUSTOMER_FIELD';
}

/**
 * Snapshot the ORM adapter maps to/from. All identifiers are strings —
 * branding master-data ids would ripple across every feature module
 * that just wants to reference a customer by id.
 */
export interface CustomerSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly creditLimitSatang: bigint;
  readonly paymentTermsDays: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCustomerProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly creditLimitSatang?: bigint;
  readonly paymentTermsDays?: number;
  readonly now: Date;
}

export class Customer {
  private constructor(private readonly s: CustomerSnapshot) {}

  static create(props: CreateCustomerProps): Customer {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidCustomerFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidCustomerFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const credit = props.creditLimitSatang ?? 0n;
    if (credit < 0n) {
      throw new InvalidCustomerFieldError(
        'creditLimitSatang must not be negative',
      );
    }
    const terms = props.paymentTermsDays ?? 0;
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      throw new InvalidCustomerFieldError(
        'paymentTermsDays must be an integer between 0 and 365',
      );
    }
    return new Customer({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      taxId: props.taxId?.trim() ?? null,
      creditLimitSatang: credit,
      paymentTermsDays: terms,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: CustomerSnapshot): Customer {
    return new Customer(s);
  }

  snapshot(): CustomerSnapshot {
    return this.s;
  }
}
