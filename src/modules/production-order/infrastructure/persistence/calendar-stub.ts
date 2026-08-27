import { Injectable } from '@nestjs/common';

import type {
  CalendarPort,
  DueDateInput,
} from '../../application/ports/calendar.port';

/**
 * Stub calendar. Adds working days by walking day-by-day and skipping
 * Saturday/Sunday. R6's real implementation queries `tenant_calendar`
 * for per-tenant Thai public holidays and shift schedules — replace
 * this binding in production-order.module.ts when that adapter lands
 * (Phase 5 note).
 */
@Injectable()
export class WeekdayOnlyCalendar implements CalendarPort {
  computeDueDate(input: DueDateInput): Promise<Date> {
    const cursor = new Date(input.start.getTime());
    let workingDaysAdded = 0;
    while (workingDaysAdded < input.workingDaysNeeded) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        workingDaysAdded += 1;
      }
    }
    return Promise.resolve(cursor);
  }
}
