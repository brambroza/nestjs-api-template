import {
  normaliseThaiAddress,
  type ThaiAddressFields,
  type ThaiAddressInput,
} from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

export class DuplicateBranchCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_BRANCH_CODE';
  constructor(readonly branchCode: string) {
    super(`Branch code "${branchCode}" already exists in this tenant`);
  }
}

export class DuplicateBranchNumberError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_BRANCH_NUMBER';
  constructor(
    readonly companyId: string,
    readonly branchNumber: string,
  ) {
    super(
      `Branch number "${branchNumber}" already exists for company ${companyId}`,
    );
  }
}

export class BranchNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.BRANCH_NOT_FOUND';
  constructor(readonly branchId: string) {
    super(`Branch ${branchId} not found`);
  }
}

export class BranchCompanyInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.BRANCH_COMPANY_INVALID';
  constructor(readonly companyId: string) {
    super(`Company ${companyId} does not exist or is inactive in this tenant`);
  }
}

export class InvalidBranchFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_BRANCH_FIELD';
}

export type BranchAddress = ThaiAddressFields;

export interface BranchSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly code: string;
  readonly name: string;
  readonly branchNumber: string;
  readonly address: BranchAddress;
  readonly isHeadOffice: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBranchProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly code: string;
  readonly name: string;
  readonly branchNumber?: string | null;
  readonly address?: ThaiAddressInput | null;
  readonly now: Date;
}

export const HEAD_OFFICE_BRANCH_NUMBER = '00000';

/**
 * Revenue Department branch numbering: 5 digits, "00000" is head office
 * (สำนักงานใหญ่). `isHeadOffice` is derived from the number, never set
 * independently, so the two can't drift apart.
 */
export class Branch {
  private constructor(private readonly s: BranchSnapshot) {}

  static create(props: CreateBranchProps): Branch {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 32) {
      throw new InvalidBranchFieldError(
        'code must be a non-empty string up to 32 characters',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new InvalidBranchFieldError(
        'name must be a non-empty string up to 200 characters',
      );
    }
    const branchNumber =
      (props.branchNumber ?? '').trim() || HEAD_OFFICE_BRANCH_NUMBER;
    if (!/^\d{5}$/.test(branchNumber)) {
      throw new InvalidBranchFieldError(
        'branchNumber must be exactly 5 digits (00000 = head office)',
      );
    }
    const address = normaliseThaiAddress(props.address ?? null);
    return new Branch({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      code,
      name,
      branchNumber,
      address,
      isHeadOffice: branchNumber === HEAD_OFFICE_BRANCH_NUMBER,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: BranchSnapshot): Branch {
    return new Branch(s);
  }

  snapshot(): BranchSnapshot {
    return this.s;
  }
}
