import { HttpStatus } from '@nestjs/common';

/**
 * Domain error `code` -> HTTP status. Adding a new domain error means
 * adding one row here and one row in `messages-th.ts`. Anything absent
 * falls through to 500 (a domain error we forgot to classify shouldn't
 * silently masquerade as a validation error, so the safe default is
 * "server bug").
 */
export const DOMAIN_ERROR_STATUS: Readonly<Record<string, HttpStatus>> = {
  'PRODUCTION_ORDER.NOT_FOUND': HttpStatus.NOT_FOUND,
  'PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION': HttpStatus.CONFLICT,
  'PRODUCTION_ORDER.SEGREGATION_OF_DUTIES': HttpStatus.FORBIDDEN,
  'PRODUCTION_ORDER.DUAL_APPROVAL_REQUIRED': HttpStatus.PRECONDITION_REQUIRED,
  'PRODUCTION_ORDER.SECOND_APPROVER_MUST_DIFFER': HttpStatus.CONFLICT,
  'PRODUCTION_ORDER.OVERPRODUCTION': HttpStatus.UNPROCESSABLE_ENTITY,
  'PRODUCTION_ORDER.MATERIAL_SHORTAGE': HttpStatus.UNPROCESSABLE_ENTITY,
  'PRODUCTION_ORDER.OPTIMISTIC_LOCK': HttpStatus.CONFLICT,

  'DOMAIN.NEGATIVE_QUANTITY': HttpStatus.BAD_REQUEST,
  'DOMAIN.QUANTITY_UOM_MISMATCH': HttpStatus.BAD_REQUEST,
  'DOMAIN.MONEY_MISMATCH': HttpStatus.BAD_REQUEST,
  'DOMAIN.INVALID_ID': HttpStatus.BAD_REQUEST,
  'DOMAIN.INVALID_BOM_LINE': HttpStatus.BAD_REQUEST,
  'DOMAIN.INVALID_TOLERANCE_POLICY': HttpStatus.INTERNAL_SERVER_ERROR,

  'AUTH.TENANT_CONTEXT_MISSING': HttpStatus.UNAUTHORIZED,
  'AUTH.USER_CONTEXT_MISSING': HttpStatus.UNAUTHORIZED,
};

export function httpStatusForCode(code: string): HttpStatus {
  return DOMAIN_ERROR_STATUS[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
}
