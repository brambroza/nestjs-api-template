import { Injectable } from '@nestjs/common';

import type { IsoDate } from '../../../../shared/domain';
import {
  CheckPostingDateUseCase,
  ResolveTaxUseCase,
  TaxKind,
} from '../../../master-data';
import { PostingPeriodClosedError } from '../domain';
import type {
  ArPostingGate,
  ArTax,
  VatLookupResult,
} from '../application/ports';

@Injectable()
export class MasterDataArTaxAdapter implements ArTax {
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

/** The Phase C gate: no AR posting into a locked / closed / missing fiscal period. */
@Injectable()
export class MasterDataPostingGate implements ArPostingGate {
  constructor(private readonly check: CheckPostingDateUseCase) {}
  async assertOpen(companyId: string, date: IsoDate): Promise<void> {
    const r = await this.check.execute({ companyId, date });
    if (!r.allowed)
      throw new PostingPeriodClosedError(companyId, date, r.reason);
  }
}
