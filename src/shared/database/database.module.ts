import { Global, Module } from '@nestjs/common';

import { TRANSACTION_MANAGER } from '../transaction';

import { PrismaService } from './prisma.service';
import { PrismaTransactionManager } from './transaction.manager';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionManager,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
  ],
  exports: [PrismaService, PrismaTransactionManager, TRANSACTION_MANAGER],
})
export class DatabaseModule {}
