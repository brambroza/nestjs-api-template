import { ProductionOrderStatus } from './production-order-status';

/**
 * R1: the ONLY table that says which state transitions are legal.
 * Any transition not listed here is forbidden. `production-order.ts`
 * calls `assertCanTransition` — no other place in the codebase is
 * allowed to reason about "can I go from X to Y".
 */
export interface AllowedTransition {
  readonly from: ProductionOrderStatus;
  readonly to: ProductionOrderStatus;
}

export const ALLOWED_TRANSITIONS: readonly AllowedTransition[] = [
  { from: ProductionOrderStatus.DRAFT, to: ProductionOrderStatus.SUBMITTED },
  { from: ProductionOrderStatus.DRAFT, to: ProductionOrderStatus.CANCELLED },
  { from: ProductionOrderStatus.SUBMITTED, to: ProductionOrderStatus.DRAFT },
  { from: ProductionOrderStatus.SUBMITTED, to: ProductionOrderStatus.APPROVED },
  {
    from: ProductionOrderStatus.SUBMITTED,
    to: ProductionOrderStatus.CANCELLED,
  },
  { from: ProductionOrderStatus.APPROVED, to: ProductionOrderStatus.RELEASED },
  { from: ProductionOrderStatus.APPROVED, to: ProductionOrderStatus.CANCELLED },
  {
    from: ProductionOrderStatus.RELEASED,
    to: ProductionOrderStatus.IN_PROGRESS,
  },
  { from: ProductionOrderStatus.RELEASED, to: ProductionOrderStatus.CANCELLED },
  {
    from: ProductionOrderStatus.IN_PROGRESS,
    to: ProductionOrderStatus.COMPLETED,
  },
] as const;

export function canTransition(
  from: ProductionOrderStatus,
  to: ProductionOrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
}
