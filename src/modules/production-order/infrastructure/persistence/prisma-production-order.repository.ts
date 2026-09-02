import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../../../../shared/cls';
import { PrismaTransactionManager } from '../../../../shared/database';
import { OptimisticLockError, OrderId, ProductionOrder } from '../../domain';
import type { ProductionOrderRepository } from '../../application/ports/production-order.repository';

import { insertShape, toDomain, updateShape } from './production-order.mapping';

type OrderClient = Pick<
  Prisma.TransactionClient,
  'productionOrder' | 'progressReport'
>;

/**
 * Prisma-backed repository. Every query is tenant-scoped through CLS —
 * even if the caller passes an OrderId belonging to another tenant, the
 * `where` clause here filters it out and `findById` returns null. R10.
 *
 * `save` implements ADR 0002 §6 optimistic locking via `where.version =
 * expected`. `updateMany` returns { count }; if count === 0 the row's
 * version has moved and we throw OptimisticLockError.
 */
@Injectable()
export class PrismaProductionOrderRepository implements ProductionOrderRepository {
  constructor(
    private readonly tx: PrismaTransactionManager,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private client(): OrderClient {
    return this.tx.getClient();
  }

  private tenantId(): string {
    const tid = this.cls.get('tenantId');
    if (!tid) {
      throw new Error(
        'PrismaProductionOrderRepository accessed without a tenantId in CLS',
      );
    }
    return tid;
  }

  async findById(id: OrderId): Promise<ProductionOrder | null> {
    const tenantId = this.tenantId();
    const client = this.client();
    const row = await client.productionOrder.findFirst({
      where: { id, tenantId },
    });
    if (!row) return null;
    const progress = await client.progressReport.findMany({
      where: { productionOrderId: id, tenantId },
      orderBy: { reportedAt: 'asc' },
    });
    return toDomain(row, progress);
  }

  async save(entity: ProductionOrder): Promise<void> {
    const client = this.client();

    // First-time insert vs. update: identify by version === 0 and no
    // existing row (findFirst is safe under the current transaction).
    if (entity.version === 0) {
      const existing = await client.productionOrder.findFirst({
        where: { id: entity.id, tenantId: entity.tenantId },
        select: { id: true },
      });
      if (!existing) {
        const insert = insertShape(entity);
        await client.productionOrder.create({
          data: { ...insert.data, version: 1 },
        });
        await this.syncProgress(
          entity.id,
          entity.tenantId,
          insert.newProgress,
          0,
        );
        return;
      }
    }

    const { data: updateData, newProgress } = updateShape(entity);
    const expectedVersion = entity.version;
    const result = await client.productionOrder.updateMany({
      where: {
        id: entity.id,
        tenantId: entity.tenantId,
        version: expectedVersion,
      },
      data: { ...updateData, version: expectedVersion + 1 },
    });
    if (result.count === 0) {
      const actual = await client.productionOrder.findFirst({
        where: { id: entity.id, tenantId: entity.tenantId },
        select: { version: true },
      });
      throw new OptimisticLockError(
        entity.id,
        expectedVersion,
        actual?.version ?? -1,
      );
    }
    await this.syncProgress(
      entity.id,
      entity.tenantId,
      newProgress,
      // We only append new progress rows — never rewrite history. Count of
      // existing rows in DB is the length of persisted progress; anything
      // beyond is new.
      undefined,
    );
  }

  private async syncProgress(
    orderId: string,
    tenantId: string,
    reports: readonly {
      quantityValue: bigint;
      quantityUom: string;
      reportedBy: string;
      reportedAt: Date;
    }[],
    existingCountHint?: number,
  ): Promise<void> {
    const client = this.client();
    const existing =
      existingCountHint ??
      (await client.progressReport.count({
        where: { productionOrderId: orderId, tenantId },
      }));
    if (reports.length <= existing) return;
    const toInsert = reports.slice(existing).map((r) => ({
      id: randomUUID(),
      productionOrderId: orderId,
      tenantId,
      quantityValue: r.quantityValue,
      quantityUom: r.quantityUom,
      reportedBy: r.reportedBy,
      reportedAt: r.reportedAt,
    }));
    for (const row of toInsert) {
      await client.progressReport.create({ data: row });
    }
  }
}
