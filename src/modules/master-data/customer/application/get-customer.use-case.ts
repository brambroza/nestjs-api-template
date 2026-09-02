import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Customer, CustomerNotFoundError } from '../domain';

import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from './ports/customer.repository';

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: CustomerRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Customer> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new CustomerNotFoundError(id);
    }
    return found;
  }
}
