export const DOCUMENT_NUMBER_GENERATOR = Symbol('DOCUMENT_NUMBER_GENERATOR');

/**
 * Gap-tolerant, per-tenant, monthly-restarting document numbers:
 * `QT-202609-0001`. The adapter increments a `doc_sequence` row inside
 * the caller's transaction (ADR 0002), so two users creating at the
 * same instant serialise on the row lock and never share a number. A
 * rolled-back transaction leaves a gap — acceptable for quotations,
 * orders and requisitions; tax invoices (Phase C) get a gapless
 * generator of their own.
 */
export interface DocumentNumberGenerator {
  next(tenantId: string, prefix: string, now: Date): Promise<string>;
}

export function yearMonthOf(now: Date): string {
  return now.toISOString().slice(0, 7).replace('-', '');
}

export function formatDocumentNumber(
  prefix: string,
  yearMonth: string,
  sequence: number,
): string {
  return `${prefix}-${yearMonth}-${String(sequence).padStart(4, '0')}`;
}
