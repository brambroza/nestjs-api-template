export const OutboxStatus = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  DELIVERED: 'DELIVERED',
  DEAD: 'DEAD',
} as const;

export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];
