import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Customer, DuplicateCustomerCodeError } from '../domain';

import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from './ports/customer.repository';

export interface CreateCustomerInput {
  readonly code: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly creditLimitSatang?: bigint;
  readonly paymentTermsDays?: number;
}

@Injectable()
export class CreateCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: CustomerRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateCustomerInput): Promise<Customer> {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByCode(tenantId, input.code.trim());
    if (existing) {
      throw new DuplicateCustomerCodeError(input.code);
    }
    const customer = Customer.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      taxId: input.taxId ?? null,
      creditLimitSatang: input.creditLimitSatang,
      paymentTermsDays: input.paymentTermsDays,
      now: this.clock.now(),
    });
    await this.repo.create(customer);
    return customer;
  }
}
