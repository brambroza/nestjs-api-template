import { DomainError } from '../../../../shared/errors';

import {
  addDays,
  addMonths,
  assertIsoDate,
  dayOfMonth,
  type IsoDate,
} from './iso-date';

export const FiscalYearStatus = { Open: 'OPEN', Closed: 'CLOSED' } as const;
export type FiscalYearStatus =
  (typeof FiscalYearStatus)[keyof typeof FiscalYearStatus];

export const FiscalPeriodStatus = {
  Open: 'OPEN',
  Locked: 'LOCKED',
  Closed: 'CLOSED',
} as const;
export type FiscalPeriodStatus =
  (typeof FiscalPeriodStatus)[keyof typeof FiscalPeriodStatus];

export function isFiscalYearStatus(v: string): v is FiscalYearStatus {
  return v === FiscalYearStatus.Open || v === FiscalYearStatus.Closed;
}
export function isFiscalPeriodStatus(v: string): v is FiscalPeriodStatus {
  return (Object.values(FiscalPeriodStatus) as readonly string[]).includes(v);
}

export const PERIODS_PER_YEAR = 12;

export class FiscalYearNotFoundError extends DomainError {
  readonly code = 'FINANCE.FISCAL_YEAR_NOT_FOUND';
  constructor(readonly fiscalYearId: string) {
    super(`Fiscal year ${fiscalYearId} not found`);
  }
}
export class DuplicateFiscalYearError extends DomainError {
  readonly code = 'FINANCE.DUPLICATE_FISCAL_YEAR';
  constructor(
    readonly companyId: string,
    readonly fiscalYearName: string,
  ) {
    super(`Company ${companyId} already has fiscal year "${fiscalYearName}"`);
  }
}
export class FiscalYearOverlapError extends DomainError {
  readonly code = 'FINANCE.FISCAL_YEAR_OVERLAP';
  constructor(
    readonly companyId: string,
    readonly overlappingName: string,
  ) {
    super(
      `The requested range overlaps fiscal year "${overlappingName}" of company ${companyId}`,
    );
  }
}
export class FiscalYearCompanyInvalidError extends DomainError {
  readonly code = 'FINANCE.FISCAL_YEAR_COMPANY_INVALID';
  constructor(readonly companyId: string) {
    super(`Company ${companyId} does not exist or is inactive`);
  }
}
export class InvalidFiscalYearFieldError extends DomainError {
  readonly code = 'FINANCE.INVALID_FISCAL_YEAR_FIELD';
}
export class FiscalPeriodNotFoundError extends DomainError {
  readonly code = 'FINANCE.FISCAL_PERIOD_NOT_FOUND';
  constructor(
    readonly fiscalYearId: string,
    readonly periodNo: number,
  ) {
    super(`Fiscal year ${fiscalYearId} has no period ${String(periodNo)}`);
  }
}
export class IllegalPeriodTransitionError extends DomainError {
  readonly code = 'FINANCE.ILLEGAL_PERIOD_TRANSITION';
  constructor(
    readonly periodNo: number,
    readonly from: FiscalPeriodStatus,
    readonly to: FiscalPeriodStatus,
  ) {
    super(`Period ${String(periodNo)} cannot go from ${from} to ${to}`);
  }
}
export class FiscalYearNotReadyToCloseError extends DomainError {
  readonly code = 'FINANCE.FISCAL_YEAR_NOT_READY_TO_CLOSE';
  constructor(readonly openPeriods: readonly number[]) {
    super(
      `Every period must be LOCKED before closing the year; still open: ${openPeriods.join(', ')}`,
    );
  }
}
export class FiscalYearClosedError extends DomainError {
  readonly code = 'FINANCE.FISCAL_YEAR_CLOSED';
  constructor(readonly fiscalYearId: string) {
    super(`Fiscal year ${fiscalYearId} is closed and cannot be modified`);
  }
}

export interface FiscalPeriodSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly fiscalYearId: string;
  readonly periodNo: number;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: FiscalPeriodStatus;
  readonly lockedAt: Date | null;
  readonly lockedBy: string | null;
  readonly lockReason: string | null;
  readonly updatedAt: Date;
}

export interface FiscalYearSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly name: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: FiscalYearStatus;
  readonly closedAt: Date | null;
  readonly closedBy: string | null;
  readonly periods: readonly FiscalPeriodSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateFiscalYearProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly name: string;
  /** Must be the 1st of a month; the year runs 12 calendar months. */
  readonly startDate: IsoDate;
  /** Exactly 12 ids, one per period. */
  readonly periodIds: readonly string[];
  readonly now: Date;
}

/** 12 consecutive calendar months from startDate (1st of month). */
export function generateMonthlyPeriods(
  startDate: IsoDate,
): readonly { periodNo: number; startDate: IsoDate; endDate: IsoDate }[] {
  return Array.from({ length: PERIODS_PER_YEAR }, (_, i) => {
    const start = addMonths(startDate, i);
    const end = addDays(addMonths(startDate, i + 1), -1);
    return { periodNo: i + 1, startDate: start, endDate: end };
  });
}

export interface PostingCheck {
  readonly allowed: boolean;
  readonly reason:
    'OK' | 'NO_FISCAL_YEAR' | 'YEAR_CLOSED' | 'PERIOD_LOCKED' | 'PERIOD_CLOSED';
  readonly fiscalYearId: string | null;
  readonly periodNo: number | null;
  readonly periodStatus: FiscalPeriodStatus | null;
}

/**
 * Fiscal year aggregate: the year and its 12 periods change together.
 * Period lock is reversible (with a recorded reason); year close is
 * not — it is the audited cut-off the Revenue Department filing rests on.
 */
export class FiscalYear {
  private constructor(private readonly s: FiscalYearSnapshot) {}

  static create(props: CreateFiscalYearProps): FiscalYear {
    const name = props.name.trim();
    if (name.length === 0 || name.length > 32) {
      throw new InvalidFiscalYearFieldError('name must be 1-32 characters');
    }
    const startDate = assertIsoDate(props.startDate, 'startDate');
    if (dayOfMonth(startDate) !== 1) {
      throw new InvalidFiscalYearFieldError(
        'startDate must be the 1st of a month',
      );
    }
    if (props.periodIds.length !== PERIODS_PER_YEAR) {
      throw new InvalidFiscalYearFieldError(
        `exactly ${String(PERIODS_PER_YEAR)} period ids are required`,
      );
    }
    const periods = generateMonthlyPeriods(startDate).map((p, i) => ({
      id: props.periodIds[i] as string,
      tenantId: props.tenantId,
      fiscalYearId: props.id,
      periodNo: p.periodNo,
      startDate: p.startDate,
      endDate: p.endDate,
      status: FiscalPeriodStatus.Open,
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
      updatedAt: props.now,
    }));
    const last = periods[periods.length - 1];
    return new FiscalYear({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      name,
      startDate,
      endDate: last ? last.endDate : startDate,
      status: FiscalYearStatus.Open,
      closedAt: null,
      closedBy: null,
      periods,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: FiscalYearSnapshot): FiscalYear {
    return new FiscalYear(s);
  }

  overlaps(startDate: IsoDate, endDate: IsoDate): boolean {
    return this.s.startDate <= endDate && startDate <= this.s.endDate;
  }

  periodFor(date: IsoDate): FiscalPeriodSnapshot | null {
    return (
      this.s.periods.find((p) => p.startDate <= date && date <= p.endDate) ??
      null
    );
  }

  postingCheck(date: IsoDate): PostingCheck {
    const period = this.periodFor(date);
    if (!period) {
      return {
        allowed: false,
        reason: 'NO_FISCAL_YEAR',
        fiscalYearId: null,
        periodNo: null,
        periodStatus: null,
      };
    }
    const base = {
      fiscalYearId: this.s.id,
      periodNo: period.periodNo,
      periodStatus: period.status,
    };
    if (this.s.status === FiscalYearStatus.Closed) {
      return { ...base, allowed: false, reason: 'YEAR_CLOSED' };
    }
    if (period.status === FiscalPeriodStatus.Locked) {
      return { ...base, allowed: false, reason: 'PERIOD_LOCKED' };
    }
    if (period.status === FiscalPeriodStatus.Closed) {
      return { ...base, allowed: false, reason: 'PERIOD_CLOSED' };
    }
    return { ...base, allowed: true, reason: 'OK' };
  }

  lockPeriod(
    periodNo: number,
    by: string,
    now: Date,
    reason: string | null,
  ): FiscalYear {
    return this.transitionPeriod(
      periodNo,
      FiscalPeriodStatus.Locked,
      by,
      now,
      reason,
    );
  }

  unlockPeriod(
    periodNo: number,
    by: string,
    now: Date,
    reason: string,
  ): FiscalYear {
    if (reason.trim().length === 0) {
      throw new InvalidFiscalYearFieldError(
        'unlocking a period requires a reason',
      );
    }
    return this.transitionPeriod(
      periodNo,
      FiscalPeriodStatus.Open,
      by,
      now,
      reason,
    );
  }

  private transitionPeriod(
    periodNo: number,
    to: FiscalPeriodStatus,
    by: string,
    now: Date,
    reason: string | null,
  ): FiscalYear {
    if (this.s.status === FiscalYearStatus.Closed) {
      throw new FiscalYearClosedError(this.s.id);
    }
    const period = this.s.periods.find((p) => p.periodNo === periodNo);
    if (!period) throw new FiscalPeriodNotFoundError(this.s.id, periodNo);
    const legal =
      (period.status === FiscalPeriodStatus.Open &&
        to === FiscalPeriodStatus.Locked) ||
      (period.status === FiscalPeriodStatus.Locked &&
        to === FiscalPeriodStatus.Open);
    if (!legal) {
      throw new IllegalPeriodTransitionError(periodNo, period.status, to);
    }
    const trimmed = (reason ?? '').trim() || null;
    if (trimmed !== null && trimmed.length > 200) {
      throw new InvalidFiscalYearFieldError('reason must be <= 200 characters');
    }
    const updated: FiscalPeriodSnapshot = {
      ...period,
      status: to,
      lockedAt: to === FiscalPeriodStatus.Locked ? now : null,
      lockedBy: to === FiscalPeriodStatus.Locked ? by : null,
      lockReason: trimmed,
      updatedAt: now,
    };
    return new FiscalYear({
      ...this.s,
      periods: this.s.periods.map((p) =>
        p.periodNo === periodNo ? updated : p,
      ),
      updatedAt: now,
    });
  }

  /** Irreversible. Requires every period LOCKED first. */
  close(by: string, now: Date): FiscalYear {
    if (this.s.status === FiscalYearStatus.Closed) {
      throw new FiscalYearClosedError(this.s.id);
    }
    const open = this.s.periods
      .filter((p) => p.status === FiscalPeriodStatus.Open)
      .map((p) => p.periodNo);
    if (open.length > 0) throw new FiscalYearNotReadyToCloseError(open);
    return new FiscalYear({
      ...this.s,
      status: FiscalYearStatus.Closed,
      closedAt: now,
      closedBy: by,
      periods: this.s.periods.map((p) => ({
        ...p,
        status: FiscalPeriodStatus.Closed,
        updatedAt: now,
      })),
      updatedAt: now,
    });
  }

  snapshot(): FiscalYearSnapshot {
    return this.s;
  }
}
