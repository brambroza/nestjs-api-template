import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { IsoDate } from '../../../../shared/domain';
import type {
  TaxDocumentKind,
  TaxInvoiceNumberGenerator,
} from '../application/ports';

/**
 * T-331: gapless per (kind, branch, month). The counter row is updated
 * inside the issuing transaction, so concurrent issuers queue on the
 * row lock and a rolled-back issue gives its number straight back.
 * Format: IV00000-202609-00001 (kind + RD branch number, yyyymm, 5 digits).
 */
@Injectable()
export class PrismaTaxInvoiceNumberGenerator implements TaxInvoiceNumberGenerator {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async next(
    tenantId: string,
    kind: TaxDocumentKind,
    branchId: string,
    branchNumber: string,
    invoiceDate: IsoDate,
  ): Promise<string> {
    const yearMonth = invoiceDate.slice(0, 7).replace('-', '');
    const key = `${kind}:${branchId}:${yearMonth}`;
    const client = this.txm.getClient();
    let sequence: number | null = null;
    for (let attempt = 0; attempt < 3 && sequence === null; attempt += 1) {
      try {
        const row = await client.taxInvoiceSequence.update({
          where: { tenantId_key: { tenantId, key } },
          data: { nextValue: { increment: 1 } },
          select: { nextValue: true },
        });
        sequence = row.nextValue - 1;
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2025'
        )
          throw err;
        try {
          await client.taxInvoiceSequence.create({
            data: { tenantId, key, nextValue: 2 },
          });
          sequence = 1;
        } catch (createErr) {
          if (
            !(createErr instanceof Prisma.PrismaClientKnownRequestError) ||
            createErr.code !== 'P2002'
          )
            throw createErr;
        }
      }
    }
    if (sequence === null)
      throw new Error(`could not claim tax invoice number for ${key}`);
    return `${kind}${branchNumber}-${yearMonth}-${String(sequence).padStart(5, '0')}`;
  }
}
