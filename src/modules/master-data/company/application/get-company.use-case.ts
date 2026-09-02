import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Company, CompanyNotFoundError } from '../domain';

import {
  COMPANY_REPOSITORY,
  type CompanyRepository,
} from './ports/company.repository';

@Injectable()
export class GetCompanyUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly repo: CompanyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Company> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new CompanyNotFoundError(id);
    }
    return found;
  }
}
