import { InvalidMovementError } from './errors';

export const SerialStatus = {
  InStock: 'IN_STOCK',
  Reserved: 'RESERVED',
  InTransit: 'IN_TRANSIT',
  Issued: 'ISSUED',
} as const;
export type SerialStatus = (typeof SerialStatus)[keyof typeof SerialStatus];
export function isSerialStatus(v: string): v is SerialStatus {
  return (Object.values(SerialStatus) as string[]).includes(v);
}

export interface SerialUnitSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly serialNumber: string;
  readonly warehouseId: string | null;
  readonly lotId: string | null;
  readonly status: SerialStatus;
  readonly lastMovementId: string | null;
  readonly createdAt: Date;
}

export const SERIAL_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;

/** Validates, normalises and de-duplicates a serial list; count must match quantity. */
export function normaliseSerials(
  serials: readonly string[],
  quantity: bigint,
): string[] {
  const out = serials.map((s) => s.trim().toUpperCase());
  for (const s of out) {
    if (!SERIAL_RE.test(s))
      throw new InvalidMovementError(`serial "${s}" is invalid`);
  }
  if (new Set(out).size !== out.length)
    throw new InvalidMovementError('duplicate serial numbers');
  if (BigInt(out.length) !== quantity) {
    throw new InvalidMovementError(
      `${String(out.length)} serial number(s) given for a quantity of ${quantity.toString()}`,
    );
  }
  return out;
}
