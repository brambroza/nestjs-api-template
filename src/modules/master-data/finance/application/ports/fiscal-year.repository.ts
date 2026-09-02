import type { FiscalYear, IsoDate } from '../../domain';

export const FISCAL_YEAR_REPOSITORY = Symbol('FISCAL_YEAR_REPOSITORY');

/** Every read returns the year WITH its periods; writes persist both. */
export interface FiscalYearRepository {
  findById(tenantId: string, id: string): Promise<FiscalYear | null>;
  findByName(
    tenantId: string,
    companyId: string,
    name: string,
  ): Promise<FiscalYear | null>;
  listForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<readonly FiscalYear[]>;
  findCovering(
    tenantId: string,
    companyId: string,
    date: IsoDate,
  ): Promise<FiscalYear | null>;
  findOverlapping(
    tenantId: string,
    companyId: string,
    startDate: IsoDate,
    endDate: IsoDate,
  ): Promise<FiscalYear | null>;
  create(year: FiscalYear): Promise<void>;
  /** Updates the year header and every period row. */
  save(year: FiscalYear): Promise<void>;
}
