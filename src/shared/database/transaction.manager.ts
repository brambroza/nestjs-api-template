import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../cls/app-cls-store';

import { PrismaService } from './prisma.service';

export const PRISMA_TX_KEY = 'prismaTx' as const;

declare module '../cls/app-cls-store' {
  // Module augmentation — attaches the tx handle key without shared/cls
  // learning about Prisma directly.

  interface AppClsStore {
    prismaTx?: Prisma.TransactionClient;
  }
}

export type PrismaClientLike = PrismaService | Prisma.TransactionClient;

/**
 * ADR 0002. `runInTransaction` opens a Prisma interactive transaction
 * and stashes the tx client in CLS under `prismaTx`. Repositories
 * resolve their client via `getClient()`; if a tx is active they see
 * it transparently.
 *
 * Nested calls PARTICIPATE in the outer transaction — no savepoints
 * (Prisma has no public savepoint API), no independent commit. The
 * outermost frame owns the outcome. See ADR 0002 §4.
 */
@Injectable()
export class PrismaTransactionManager {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  getClient(): PrismaClientLike {
    return this.cls.get('prismaTx') ?? this.prisma;
  }

  async runInTransaction<T>(
    work: () => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      timeoutMs?: number;
    },
  ): Promise<T> {
    if (this.cls.get('prismaTx')) {
      return work();
    }
    return this.prisma.$transaction(
      async (tx) => {
        this.cls.set('prismaTx', tx);
        try {
          return await work();
        } finally {
          this.cls.set('prismaTx', undefined);
        }
      },
      {
        isolationLevel:
          options?.isolationLevel ??
          Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: options?.timeoutMs ?? 15_000,
      },
    );
  }
}
