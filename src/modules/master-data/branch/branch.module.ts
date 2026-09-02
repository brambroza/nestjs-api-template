import { Module } from '@nestjs/common';

import { BranchController } from './api/branch.controller';
import {
  CreateBranchUseCase,
  GetBranchUseCase,
  ListBranchesUseCase,
} from './application';
import { BRANCH_REPOSITORY } from './application/ports/branch.repository';
import { COMPANY_LOOKUP } from './application/ports/company-lookup.port';
import { PrismaBranchRepository } from './infrastructure/prisma-branch.repository';
import { PrismaCompanyLookup } from './infrastructure/prisma-company-lookup';

@Module({
  controllers: [BranchController],
  providers: [
    { provide: BRANCH_REPOSITORY, useClass: PrismaBranchRepository },
    { provide: COMPANY_LOOKUP, useClass: PrismaCompanyLookup },
    CreateBranchUseCase,
    GetBranchUseCase,
    ListBranchesUseCase,
  ],
  exports: [CreateBranchUseCase, GetBranchUseCase, ListBranchesUseCase],
})
export class BranchModule {}
