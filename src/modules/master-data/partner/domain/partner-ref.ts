import { DomainError } from '../../../../shared/errors';

export const PartnerType = {
  Customer: 'CUSTOMER',
  Vendor: 'VENDOR',
} as const;
export type PartnerType = (typeof PartnerType)[keyof typeof PartnerType];

export function isPartnerType(v: string): v is PartnerType {
  return v === PartnerType.Customer || v === PartnerType.Vendor;
}

/**
 * Polymorphic reference to a customer or vendor. Every partner
 * sub-resource (contact, address, consent, request) carries one.
 */
export interface PartnerRef {
  readonly type: PartnerType;
  readonly id: string;
}

export class PartnerNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.PARTNER_NOT_FOUND';
  constructor(readonly partner: PartnerRef) {
    super(
      `${partner.type} ${partner.id} does not exist or is inactive in this tenant`,
    );
  }
}
