import {
  normaliseThaiAddress,
  type ThaiAddressFields,
  type ThaiAddressInput,
} from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

import type { PartnerRef } from './partner-ref';

export const AddressType = {
  Billing: 'BILLING',
  Shipping: 'SHIPPING',
} as const;
export type AddressType = (typeof AddressType)[keyof typeof AddressType];

export function isAddressType(v: string): v is AddressType {
  return v === AddressType.Billing || v === AddressType.Shipping;
}

export class AddressNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.ADDRESS_NOT_FOUND';
  constructor(readonly addressId: string) {
    super(`Address ${addressId} not found`);
  }
}

export class DefaultAddressExistsError extends DomainError {
  readonly code = 'MASTER_DATA.DEFAULT_ADDRESS_EXISTS';
  constructor(
    readonly partner: PartnerRef,
    readonly addressType: AddressType,
    readonly existingAddressId: string,
  ) {
    super(
      `${partner.type} ${partner.id} already has a default ${addressType} address (${existingAddressId})`,
    );
  }
}

export class InvalidAddressFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_ADDRESS_FIELD';
}

export interface PartnerAddressSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly addressType: AddressType;
  readonly label: string | null;
  readonly address: ThaiAddressFields & { readonly line1: string };
  readonly countryCode: string;
  readonly branchNumber: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePartnerAddressProps {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly addressType: AddressType;
  readonly label?: string | null;
  readonly address: ThaiAddressInput;
  readonly countryCode?: string | null;
  readonly branchNumber?: string | null;
  readonly isDefault?: boolean;
  readonly now: Date;
}

/**
 * `branchNumber` is the PARTNER's Revenue Department branch number and
 * only carries meaning on BILLING addresses — a Thai tax invoice must
 * print "สำนักงานใหญ่" or "สาขาที่ NNNNN" for the buyer. It is accepted
 * on SHIPPING too (no harm) but a UI should hide it there.
 */
export class PartnerAddress {
  private constructor(private readonly s: PartnerAddressSnapshot) {}

  static create(props: CreatePartnerAddressProps): PartnerAddress {
    const label = (props.label ?? '').trim() || null;
    if (label !== null && label.length > 100) {
      throw new InvalidAddressFieldError(
        'label must be at most 100 characters',
      );
    }
    const fields = normaliseThaiAddress(props.address, { requireLine1: true });
    const line1 = fields.line1;
    if (line1 === null) {
      // normaliseThaiAddress already threw; this narrows the type.
      throw new InvalidAddressFieldError('line1 is required');
    }
    const countryCode = (props.countryCode ?? 'TH').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new InvalidAddressFieldError(
        'countryCode must be an ISO 3166-1 alpha-2 code',
      );
    }
    const branchNumber = (props.branchNumber ?? '').trim() || null;
    if (branchNumber !== null && !/^\d{5}$/.test(branchNumber)) {
      throw new InvalidAddressFieldError(
        'branchNumber must be exactly 5 digits (00000 = head office)',
      );
    }
    return new PartnerAddress({
      id: props.id,
      tenantId: props.tenantId,
      partner: props.partner,
      addressType: props.addressType,
      label,
      address: { ...fields, line1 },
      countryCode,
      branchNumber,
      isDefault: props.isDefault ?? false,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: PartnerAddressSnapshot): PartnerAddress {
    return new PartnerAddress(s);
  }

  snapshot(): PartnerAddressSnapshot {
    return this.s;
  }
}
