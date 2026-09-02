import { Module } from '@nestjs/common';

import { ReceivableModule } from './receivable/receivable.module';

/**
 * Finance container (Phase C): receivable now; payable, ledger and tax
 * reports follow. Sub-modules never import each other — cross reads go
 * through lookup ports with direct Prisma adapters. dependency-cruiser
 * treats `finance/<sub>` as the module boundary.
 */
@Module({
  imports: [ReceivableModule],
  exports: [ReceivableModule],
})
export class FinanceModule {}
