import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Company, DuplicateCompanyCodeError } from '../domain';

import {
  COMPANY_REPOSITORY,
  type CompanyRepository,
} from './ports/company.repository';

export interface CreateCompanyInput {
  readonly code: string;
  readonly name: string;
  readonly legalName?: string | null;
  readonly taxId?: string | null;
  readonly baseCurrency?: string | null;
}

@Injectable()
export class CreateCompanyUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly repo: CompanyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateCompanyInput): Promise<Company> {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByCode(tenantId, input.code.trim());
    if (existing) {
      throw new DuplicateCompanyCodeError(input.code);
    }
    const company = Company.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      legalName: input.legalName ?? null,
      taxId: input.taxId ?? null,
      baseCurrency: input.baseCurrency ?? null,
      now: this.clock.now(),
    });
    await this.repo.create(company);
    return company;
  }
}
