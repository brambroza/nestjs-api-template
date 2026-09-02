import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import type {
  TaxCompany,
  VatDocument,
  VatDocumentKind,
  WhtCertificateFacts,
} from '../domain';
import type { TaxDataLookup } from '../application/ports';

const OUTPUT_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'APPLIED'];
const INPUT_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'PAID'];

function docKind(type: string): VatDocumentKind {
  return type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE' ? type : 'INVOICE';
}

/** Reads fin_sales_invoice, fin_vendor_invoice, fin_wht_certificate directly (lookup-port pattern). */
@Injectable()
export class PrismaTaxDataLookup implements TaxDataLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findCompany(
    tenantId: string,
    companyId: string,
  ): Promise<TaxCompany | null> {
    const client = this.txm.getClient();
    const c = await client.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, legalName: true, taxId: true },
    });
    if (!c) return null;
    const head = await client.branch.findFirst({
      where: { tenantId, companyId, branchNumber: '00000' },
      select: { branchNumber: true },
    });
    return {
      id: c.id,
      legalName: c.legalName,
      taxId: c.taxId,
      branchNumber: head?.branchNumber ?? '00000',
    };
  }

  async listOutputVat(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly VatDocument[]> {
    const rows = await this.txm.getClient().salesInvoice.findMany({
      where: {
        tenantId,
        companyId,
        status: { in: OUTPUT_STATUSES },
        number: { not: null },
        invoiceDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
    });
    return rows.map((r) => ({
      docId: r.id,
      docDate: toIsoDate(r.invoiceDate),
      docNumber: r.number ?? r.id,
      kind: docKind(r.type),
      partyName: r.customerName,
      partyTaxId: r.customerTaxId,
      partyBranchNumber: r.customerBranchNumber,
      baseMinor: r.subtotalMinor - r.discountMinor,
      vatMinor: r.taxMinor,
    }));
  }

  async listInputVat(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly VatDocument[]> {
    const rows = await this.txm.getClient().vendorInvoice.findMany({
      where: {
        tenantId,
        companyId,
        status: { in: INPUT_STATUSES },
        invoiceDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      orderBy: [{ invoiceDate: 'asc' }, { vendorInvoiceNumber: 'asc' }],
    });
    return rows.map((r) => ({
      docId: r.id,
      docDate: toIsoDate(r.invoiceDate),
      docNumber: r.vendorInvoiceNumber,
      kind: 'INVOICE' as const,
      partyName: r.vendorName,
      partyTaxId: r.vendorTaxId,
      partyBranchNumber: null,
      baseMinor: r.subtotalMinor - r.discountMinor,
      vatMinor: r.taxMinor,
    }));
  }

  async listWhtCertificates(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly WhtCertificateFacts[]> {
    const rows = await this.txm.getClient().whtCertificate.findMany({
      where: {
        tenantId,
        companyId,
        paymentDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
      orderBy: [{ paymentDate: 'asc' }, { number: 'asc' }],
    });
    return rows.map((r) => ({
      number: r.number,
      pndForm: r.pndForm,
      paymentDate: toIsoDate(r.paymentDate),
      vendorName: r.vendorName,
      vendorTaxId: r.vendorTaxId,
      isVoid: r.isVoid,
      lines: r.lines.map((l) => ({
        incomeType: l.incomeType,
        rateBp: l.rateBp,
        baseMinor: l.baseMinor,
        taxMinor: l.taxMinor,
      })),
    }));
  }
}
