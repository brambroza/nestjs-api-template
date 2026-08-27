import { DomainError } from '../../../../shared/errors';

import type { Branded } from './branded';

export type TenantId = Branded<'TenantId'>;
export type UserId = Branded<'UserId'>;
export type OrderId = Branded<'OrderId'>;
export type Sku = Branded<'Sku'>;

export class InvalidIdError extends DomainError {
  readonly code = 'DOMAIN.INVALID_ID';
}

function nonEmpty(kind: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidIdError(`${kind} must be a non-empty string`);
  }
}

export const TenantId = {
  of(value: string): TenantId {
    nonEmpty('TenantId', value);
    return value as TenantId;
  },
};

export const UserId = {
  of(value: string): UserId {
    nonEmpty('UserId', value);
    return value as UserId;
  },
};

export const OrderId = {
  of(value: string): OrderId {
    nonEmpty('OrderId', value);
    return value as OrderId;
  },
};

export const Sku = {
  of(value: string): Sku {
    nonEmpty('Sku', value);
    return value as Sku;
  },
};
