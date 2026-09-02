import { DomainError } from '../../../../shared/errors';

/** Hard cap per file (T-126: "10k rows"). Larger files must be split. */
export const MAX_IMPORT_ROWS = 10_000;

/**
 * One parsed spreadsheet row, already reduced to strings by the parser.
 * `rowNumber` is the 1-based spreadsheet row so error reports point at
 * the cell the user has to fix.
 */
export interface ItemImportRow {
  readonly rowNumber: number;
  readonly sku: string;
  readonly name: string;
  readonly defaultUomCode: string;
  readonly description: string | null;
  readonly categoryCode: string | null;
  readonly trackingPolicy: string | null;
  readonly shelfLifeDays: string | null;
}

export interface ImportRowError {
  readonly rowNumber: number;
  readonly sku: string | null;
  readonly message: string;
}

export const ImportOutcome = {
  /** Every row valid, all inserted. */
  Imported: 'IMPORTED',
  /** Some rows invalid; the valid ones were inserted (allowPartial). */
  Partial: 'PARTIAL',
  /** Some rows invalid; nothing inserted (all-or-nothing default). */
  Rejected: 'REJECTED',
  /** Validation only; nothing inserted. */
  DryRun: 'DRY_RUN',
} as const;
export type ImportOutcome = (typeof ImportOutcome)[keyof typeof ImportOutcome];

export interface ImportReport {
  readonly outcome: ImportOutcome;
  readonly totalRows: number;
  readonly validRows: number;
  readonly insertedRows: number;
  readonly errors: readonly ImportRowError[];
}

export class ImportTooLargeError extends DomainError {
  readonly code = 'MASTER_DATA.IMPORT_TOO_LARGE';
  constructor(readonly rows: number) {
    super(
      `Import has ${String(rows)} rows; the limit is ${String(MAX_IMPORT_ROWS)} per file`,
    );
  }
}

/** The file could not be read as an item sheet at all (no header, wrong format). */
export class ImportFileInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.IMPORT_FILE_INVALID';
}
