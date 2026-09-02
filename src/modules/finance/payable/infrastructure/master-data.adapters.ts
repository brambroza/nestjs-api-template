import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { IsoDate } from '../../../../shared/domain';
import {
  CheckPostingDateUseCase,
  ResolveTaxUseCase,
  TaxKind,
} from '../../../master-data';
import { ApPostingPeriodClosedError } from '../domain';
import type {
  ApPostingGate,
  ApTax,
  VatLookupResult,
  WhtCodeRef,
} from '../application/ports';

@Injectable()
export class MasterDataApTaxAdapter implements ApTax {
  constructor(
    private readonly resolveTax: ResolveTaxUseCase,
    private readonly txm: PrismaTransactionManager,
  ) {}
  async resolveVat(itemId: string): Promise<VatLookupResult> {
    const t = await this.resolveTax.execute({ kind: TaxKind.Vat, itemId });
    const s = t.taxCode.snapshot();
    return {
      taxCodeId: s.id,
      taxCode: s.code,
      rateBasisPoints: Number(s.rateBasisPoints),
    };
  }
  /** WHT codes are looked up by id (the buyer picks the income type per line). */
  async findWhtCode(taxCodeId: string): Promise<WhtCodeRef | null> {
    const r = await this.txm.getClient().taxCode.findFirst({
      where: { id: taxCodeId, kind: TaxKind.Wht, isActive: true },
    });
    return r
      ? {
          id: r.id,
          code: r.code,
          rateBasisPoints: Number(r.rateBasisPoints),
          pndForm: r.pndForm,
          incomeType: r.whtIncomeType,
        }
      : null;
  }
}

@Injectable()
export class MasterDataApPostingGate implements ApPostingGate {
  constructor(private readonly check: CheckPostingDateUseCase) {}
  async assertOpen(companyId: string, date: IsoDate): Promise<void> {
    const r = await this.check.execute({ companyId, date });
    if (!r.allowed)
      throw new ApPostingPeriodClosedError(companyId, date, r.reason);
  }
}
