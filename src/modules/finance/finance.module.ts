import { Module } from '@nestjs/common';

import { PayableModule } from './payable/payable.module';
import { ReceivableModule } from './receivable/receivable.module';

/**
 * Finance container (Phase C): receivable and payable now; ledger and
 * tax reports follow. Sub-modules never import each other — cross reads go
 * through lookup ports with direct Prisma adapters. dependency-cruiser
 * treats `finance/<sub>` as the module boundary.
 */
@Module({
  imports: [ReceivableModule, PayableModule],
  exports: [ReceivableModule, PayableModule],
})
export class FinanceModule {}
