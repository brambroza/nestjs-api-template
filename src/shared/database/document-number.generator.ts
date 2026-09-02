import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  formatDocumentNumber,
  yearMonthOf,
  type DocumentNumberGenerator,
} from '../sequence';

import { PrismaTransactionManager } from './transaction.manager';

const RECORD_NOT_FOUND = 'P2025';
const UNIQUE_VIOLATION = 'P2002';

function prismaCode(err: unknown): string | null {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
}

/**
 * Increments `doc_sequence(tenantId, key)` and returns the value it
 * held before the increment. Joins the ambient transaction via CLS.
 * First use of a key races benignly: the loser of the insert race
 * simply retries as an update.
 */
@Injectable()
export class PrismaDocumentNumberGenerator implements DocumentNumberGenerator {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async next(tenantId: string, prefix: string, now: Date): Promise<string> {
    const yearMonth = yearMonthOf(now);
    const key = `${prefix}:${yearMonth}`;
    const sequence = await this.claim(tenantId, key);
    return formatDocumentNumber(prefix, yearMonth, sequence);
  }

  private async claim(tenantId: string, key: string): Promise<number> {
    const client = this.txm.getClient();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const row = await client.documentSequence.update({
          where: { tenantId_key: { tenantId, key } },
          data: { nextValue: { increment: 1 } },
          select: { nextValue: true },
        });
        return row.nextValue - 1;
      } catch (err) {
        if (prismaCode(err) !== RECORD_NOT_FOUND) throw err;
      }
      try {
        await client.documentSequence.create({
          data: { tenantId, key, nextValue: 2 },
        });
        return 1;
      } catch (err) {
        if (prismaCode(err) !== UNIQUE_VIOLATION) throw err;
      }
    }
    throw new Error(`could not claim document number for ${key}`);
  }
}
