import type { IsoDate } from '../../../../../shared/domain';
import type {
  TaxCompany,
  VatDocument,
  WhtCertificateFacts,
} from '../../domain';

export const TAX_DATA_LOOKUP = Symbol('TAX_DATA_LOOKUP');

/** Read-only view over AR / AP / WHT tables for the Revenue Department exports. */
export interface TaxDataLookup {
  findCompany(tenantId: string, companyId: string): Promise<TaxCompany | null>;
  /** Issued sales tax invoices and notes by invoice date (tax point). */
  listOutputVat(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly VatDocument[]>;
  /** Posted vendor tax invoices by invoice date. */
  listInputVat(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly VatDocument[]>;
  listWhtCertificates(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly WhtCertificateFacts[]>;
}
