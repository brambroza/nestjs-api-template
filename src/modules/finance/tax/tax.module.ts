import { Module } from '@nestjs/common';

import { TaxController } from './api/tax.controller';
import {
  PndReportUseCase,
  Pp30UseCase,
  TAX_DATA_LOOKUP,
  VatReportUseCase,
} from './application';
import { PrismaTaxDataLookup } from './infrastructure/prisma-tax-data.lookup';

/** EPIC-C.5 Thai tax exports: PP30, PND3/PND53, input/output VAT reports. */
@Module({
  controllers: [TaxController],
  providers: [
    { provide: TAX_DATA_LOOKUP, useClass: PrismaTaxDataLookup },
    Pp30UseCase,
    VatReportUseCase,
    PndReportUseCase,
  ],
})
export class TaxModule {}
