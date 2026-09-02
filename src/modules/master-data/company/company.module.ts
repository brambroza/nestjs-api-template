import { Module } from '@nestjs/common';

import { CompanyController } from './api/company.controller';
import {
  CreateCompanyUseCase,
  GetCompanyUseCase,
  ListCompaniesUseCase,
} from './application';
import { COMPANY_REPOSITORY } from './application/ports/company.repository';
import { PrismaCompanyRepository } from './infrastructure/prisma-company.repository';

@Module({
  controllers: [CompanyController],
  providers: [
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
    CreateCompanyUseCase,
    GetCompanyUseCase,
    ListCompaniesUseCase,
  ],
  exports: [CreateCompanyUseCase, GetCompanyUseCase, ListCompaniesUseCase],
})
export class CompanyModule {}
