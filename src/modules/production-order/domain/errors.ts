import { DomainError } from '../../../shared/errors';

import type { ProductionOrderStatus } from './production-order-status';

export class IllegalStatusTransitionError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION';

  constructor(
    readonly from: ProductionOrderStatus,
    readonly to: ProductionOrderStatus,
  ) {
    super(`Illegal transition ${from} -> ${to}`);
  }
}
