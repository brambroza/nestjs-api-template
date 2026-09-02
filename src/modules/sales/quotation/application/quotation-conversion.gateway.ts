import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import type { DocumentLineInput, IsoDate } from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { QuotationNotFoundError, type QuotationStatus } from '../domain';

import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from './ports/quotation.repository';

export const QUOTATION_CONVERSION = Symbol('QUOTATION_CONVERSION');

/** Read model the sales-order module needs to build an order from a quotation. */
export interface ConvertibleQuotation {
  readonly id: string;
  readonly number: string;
  readonly revision: number;
  readonly status: QuotationStatus;
  readonly companyId: string;
  readonly customerId: string;
  readonly currency: string;
  readonly validUntil: IsoDate;
  readonly paymentTermsDays: number;
  readonly notes: string | null;
  readonly salesOrderId: string | null;
  readonly lines: readonly DocumentLineInput[];
}

/**
 * The ONLY surface the sales-order module sees of quotations
 * (re-exported from the module root). `markConverted` joins the
 * caller's transaction via CLS, so order creation and the back-link
 * commit or roll back together.
 */
export interface QuotationConversion {
  findForConversion(quotationId: string): Promise<ConvertibleQuotation | null>;
  markConverted(quotationId: string, salesOrderId: string): Promise<void>;
}

@Injectable()
export class QuotationConversionService implements QuotationConversion {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findForConversion(
    quotationId: string,
  ): Promise<ConvertibleQuotation | null> {
    const q = await this.repo.findById(this.tenant.getTenantId(), quotationId);
    if (!q) return null;
    const s = q.snapshot();
    return {
      id: s.id,
      number: s.number,
      revision: s.revision,
      status: s.status,
      companyId: s.companyId,
      customerId: s.customerId,
      currency: s.currency,
      validUntil: s.validUntil,
      paymentTermsDays: s.paymentTermsDays,
      notes: s.notes,
      salesOrderId: s.salesOrderId,
      lines: s.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemSku: l.itemSku,
        description: l.description,
        uomCode: l.uomCode,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        priceSource: l.priceSource,
        priceListId: l.priceListId,
        discountBp: l.discountBp,
        taxCodeId: l.taxCodeId,
        taxCode: l.taxCode,
        taxRateBp: l.taxRateBp,
      })),
    };
  }

  async markConverted(
    quotationId: string,
    salesOrderId: string,
  ): Promise<void> {
    const q = await this.repo.findById(this.tenant.getTenantId(), quotationId);
    if (!q) throw new QuotationNotFoundError(quotationId);
    await this.repo.save(q.linkSalesOrder(salesOrderId, this.clock.now()));
  }
}
