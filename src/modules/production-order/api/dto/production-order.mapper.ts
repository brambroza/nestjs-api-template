import type { ProductionOrder } from '../../domain';

import { ProductionOrderResponseDto } from './production-order.response.dto';

/**
 * Converts a domain aggregate into the response DTO. Every field is
 * spelled out — no `Object.assign(dto, snap)` — so leaking a new
 * private field takes an explicit code change, not a schema change.
 */
export function toResponseDto(
  order: ProductionOrder,
): ProductionOrderResponseDto {
  const snap = order.snapshot();
  const dto = new ProductionOrderResponseDto();
  dto.id = snap.id;
  dto.tenantId = snap.tenantId;
  dto.createdBy = snap.createdBy;
  dto.status = snap.status;
  dto.orderedQuantity = {
    value: snap.orderedQuantity.value.toString(),
    uom: snap.orderedQuantity.uom,
  };
  dto.totalAmount = {
    amount: snap.totalAmount.amount.toString(),
    currency: snap.totalAmount.currency,
  };
  dto.firstApprover = snap.firstApprover;
  dto.secondApprover = snap.secondApprover;
  dto.producedQuantity = {
    value: snap.producedQuantity.value.toString(),
    uom: snap.producedQuantity.uom,
  };
  dto.version = snap.version;
  dto.createdAt = snap.createdAt.toISOString();
  dto.updatedAt = snap.updatedAt.toISOString();
  return dto;
}
