import { Module } from '@nestjs/common';

import { LedgerModule } from './ledger/ledger.module';
import { PayableModule } from './payable/payable.module';
import { ReceivableModule } from './receivable/receivable.module';
import { TaxModule } from './tax/tax.module';

/**
 * Finance container (Phase C): receivable, payable, ledger and tax
 * exports. Sub-modules never reach into each other's layers — AR/AP post
 * to the GL only through the ledger's root-level gateway (LEDGER_POSTING),
 * and every other cross read goes through a lookup port with a direct
 * Prisma adapter. dependency-cruiser treats `finance/<sub>` as the
 * module boundary.
 */
@Module({
  imports: [LedgerModule, ReceivableModule, PayableModule, TaxModule],
  exports: [LedgerModule, ReceivableModule, PayableModule, TaxModule],
})
export class FinanceModule {}
