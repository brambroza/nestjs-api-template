import { DomainError } from '../../../../shared/errors';

export class DuplicateVendorCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_VENDOR_CODE';
  constructor(readonly vendorCode: string) {
    super(`Vendor code "${vendorCode}" already exists in this tenant`);
  }
}

export class VendorNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.VENDOR_NOT_FOUND';
  constructor(readonly vendorId: string) {
    super(`Vendor ${vendorId} not found`);
  }
}

export class InvalidVendorFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_VENDOR_FIELD';
}

export interface VendorSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly paymentTermsDays: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateVendorProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly paymentTermsDays?: number;
  readonly now: Date;
}

export class Vendor {
  private constructor(private readonly s: VendorSnapshot) {}

  static create(props: CreateVendorProps): Vendor {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidVendorFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidVendorFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const terms = props.paymentTermsDays ?? 0;
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      throw new InvalidVendorFieldError(
        'paymentTermsDays must be an integer between 0 and 365',
      );
    }
    return new Vendor({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      taxId: props.taxId?.trim() ?? null,
      paymentTermsDays: terms,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: VendorSnapshot): Vendor {
    return new Vendor(s);
  }

  snapshot(): VendorSnapshot {
    return this.s;
  }
}
