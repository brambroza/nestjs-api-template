import {
  isAddressType,
  isConsentAction,
  isConsentPurpose,
  isConsentSource,
  isPartnerType,
  isPdpaRequestType,
  PdpaRequestStatus,
  type AddressType,
  type ConsentAction,
  type ConsentPurpose,
  type ConsentSource,
  type PartnerRef,
  type PdpaRequestStatus as PdpaRequestStatusT,
  type PdpaRequestType,
} from '../domain';

/**
 * Rows store enums as NVARCHAR. A value outside the domain's set means
 * someone wrote to the table behind the app's back; refuse to load it
 * rather than let a bad string flow into the domain as a "valid" enum.
 */
export class CorruptRowError extends Error {
  constructor(table: string, column: string, value: string) {
    super(`${table}.${column} holds unknown value "${value}"`);
    this.name = 'CorruptRowError';
  }
}

export function toPartnerRef(
  table: string,
  row: { partnerType: string; partnerId: string },
): PartnerRef {
  if (!isPartnerType(row.partnerType)) {
    throw new CorruptRowError(table, 'partnerType', row.partnerType);
  }
  return { type: row.partnerType, id: row.partnerId };
}

export function toAddressType(v: string): AddressType {
  if (!isAddressType(v))
    throw new CorruptRowError('md_partner_address', 'addressType', v);
  return v;
}

export function toConsentPurpose(v: string): ConsentPurpose {
  if (!isConsentPurpose(v))
    throw new CorruptRowError('pdpa_consent', 'purpose', v);
  return v;
}

export function toConsentAction(v: string): ConsentAction {
  if (!isConsentAction(v))
    throw new CorruptRowError('pdpa_consent', 'action', v);
  return v;
}

export function toConsentSource(v: string): ConsentSource {
  if (!isConsentSource(v))
    throw new CorruptRowError('pdpa_consent', 'source', v);
  return v;
}

export function toPdpaRequestType(v: string): PdpaRequestType {
  if (!isPdpaRequestType(v))
    throw new CorruptRowError('pdpa_request', 'requestType', v);
  return v;
}

export function toPdpaRequestStatus(v: string): PdpaRequestStatusT {
  if (
    v !== PdpaRequestStatus.Pending &&
    v !== PdpaRequestStatus.Completed &&
    v !== PdpaRequestStatus.Rejected
  ) {
    throw new CorruptRowError('pdpa_request', 'status', v);
  }
  return v;
}
