import { Module } from '@nestjs/common';

import { CustomerController } from './api/customer.controller';
import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository';
import {
  CreateCustomerUseCase,
  GetCustomerUseCase,
  ListCustomersUseCase,
} from './application';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';

@Module({
  controllers: [CustomerController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
    CreateCustomerUseCase,
    GetCustomerUseCase,
    ListCustomersUseCase,
  ],
  exports: [CreateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase],
})
export class CustomerModule {}
