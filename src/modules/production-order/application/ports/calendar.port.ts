import type { TenantId } from '../../domain';

export const CALENDAR = Symbol('CALENDAR');

export interface DueDateInput {
  readonly tenantId: TenantId;
  readonly start: Date;
  readonly workingDaysNeeded: number;
}

/**
 * R6. Add `workingDaysNeeded` days to `start` while skipping the
 * tenant's non-working days (weekends by default plus Thai public
 * holidays) and honouring the shift schedule. The calendar itself
 * lives in master-data and is per tenant — the adapter is what
 * knows how to read it.
 */
export interface CalendarPort {
  computeDueDate(input: DueDateInput): Promise<Date>;
}
