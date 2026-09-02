import { Module } from '@nestjs/common';

import { ProcurementModule } from './procurement/procurement.module';

/**
 * Purchase container (Phase B): procurement (PR → PO → GRN) now; vendor
 * invoices / RMA later. dependency-cruiser treats `purchase/<sub>` as
 * the module boundary.
 */
@Module({
  imports: [ProcurementModule],
  exports: [ProcurementModule],
})
export class PurchaseModule {}
