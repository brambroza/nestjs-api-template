import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  InvalidTaxPeriodError,
  TaxRefInvalidError,
  buildPndReport,
  buildPp30,
  buildVatReport,
  parseTaxMonth,
  type PndForm,
  type PndReport,
  type Pp30Summary,
  type TaxCompany,
  type TaxMonth,
  type VatReport,
  type VatReportKind,
} from '../domain';

import { TAX_DATA_LOOKUP, type TaxDataLookup } from './ports';

export interface TaxReportInput {
  readonly companyId: string;
  /** YYYY-MM */
  readonly month: string;
}

abstract class TaxReport {
  constructor(
    protected readonly data: TaxDataLookup,
    protected readonly tenant: TenantContext,
  ) {}
  protected async resolve(
    input: TaxReportInput,
  ): Promise<{ company: TaxCompany; period: TaxMonth }> {
    const period = parseTaxMonth(input.month);
    if (!period) throw new InvalidTaxPeriodError(input.month);
    const company = await this.data.findCompany(
      this.tenant.getTenantId(),
      input.companyId,
    );
    if (!company)
      throw new TaxRefInvalidError(`company ${input.companyId} does not exist`);
    return { company, period };
  }
  protected vat(
    kind: VatReportKind,
    company: TaxCompany,
    period: TaxMonth,
  ): Promise<VatReport> {
    const t = this.tenant.getTenantId();
    const docs =
      kind === 'OUTPUT'
        ? this.data.listOutputVat(t, company.id, period.from, period.to)
        : this.data.listInputVat(t, company.id, period.from, period.to);
    return docs.then((d) => buildVatReport(kind, period.month, d));
  }
}

/** T-364 */
@Injectable()
export class VatReportUseCase extends TaxReport {
  constructor(
    @Inject(TAX_DATA_LOOKUP) data: TaxDataLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(data, tenant);
  }
  async execute(
    input: TaxReportInput & { readonly kind: VatReportKind },
  ): Promise<VatReport> {
    const { company, period } = await this.resolve(input);
    return this.vat(input.kind, company, period);
  }
}

/** T-360 */
@Injectable()
export class Pp30UseCase extends TaxReport {
  constructor(
    @Inject(TAX_DATA_LOOKUP) data: TaxDataLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(data, tenant);
  }
  async execute(input: TaxReportInput): Promise<Pp30Summary> {
    const { company, period } = await this.resolve(input);
    const [output, inputVat] = await Promise.all([
      this.vat('OUTPUT', company, period),
      this.vat('INPUT', company, period),
    ]);
    return buildPp30(period.month, company, output, inputVat);
  }
}

/** T-361 */
@Injectable()
export class PndReportUseCase extends TaxReport {
  constructor(
    @Inject(TAX_DATA_LOOKUP) data: TaxDataLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(data, tenant);
  }
  async execute(
    input: TaxReportInput & { readonly form: PndForm },
  ): Promise<PndReport> {
    const { company, period } = await this.resolve(input);
    const certs = await this.data.listWhtCertificates(
      this.tenant.getTenantId(),
      company.id,
      period.from,
      period.to,
    );
    return buildPndReport(input.form, period.month, certs);
  }
}
