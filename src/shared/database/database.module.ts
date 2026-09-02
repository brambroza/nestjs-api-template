import { Global, Module } from '@nestjs/common';

import { DOCUMENT_NUMBER_GENERATOR } from '../sequence';
import { TRANSACTION_MANAGER } from '../transaction';

import { PrismaDocumentNumberGenerator } from './document-number.generator';
import { PrismaService } from './prisma.service';
import { PrismaTransactionManager } from './transaction.manager';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionManager,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    {
      provide: DOCUMENT_NUMBER_GENERATOR,
      useClass: PrismaDocumentNumberGenerator,
    },
  ],
  exports: [
    PrismaService,
    PrismaTransactionManager,
    TRANSACTION_MANAGER,
    DOCUMENT_NUMBER_GENERATOR,
  ],
})
export class DatabaseModule {}
