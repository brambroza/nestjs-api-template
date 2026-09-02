import { Injectable } from '@nestjs/common';

import { ResolveTaxUseCase, TaxKind } from '../../../master-data';
import type {
  PurchaseTax,
  VatLookupResult,
} from '../application/ports/purchase-tax.port';

/** Adapter over master-data's public surface (input VAT per item override / default). */
@Injectable()
export class MasterDataTaxAdapter implements PurchaseTax {
  constructor(private readonly resolveTax: ResolveTaxUseCase) {}

  async resolveVat(itemId: string): Promise<VatLookupResult> {
    const t = await this.resolveTax.execute({ kind: TaxKind.Vat, itemId });
    const s = t.taxCode.snapshot();
    return {
      taxCodeId: s.id,
      taxCode: s.code,
      rateBasisPoints: Number(s.rateBasisPoints),
    };
  }
}
