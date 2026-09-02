import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

/**
 * Development seed. Creates one tenant + a matching production order
 * with BOM + stock so the golden-path curl walkthrough in README works
 * on a fresh clone. Not for production.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenantId = 'tenant-demo';
    const alice = 'user-alice';
    const orderId = 'demo-order-1';

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: 'Demo Factory',
        dualApprovalThresholdSatang: 50_000_00n,
        overToleranceBasisPoints: 500n,
        underToleranceBasisPoints: 100n,
      },
    });

    await prisma.productionOrder.upsert({
      where: { id: orderId },
      update: {},
      create: {
        id: orderId,
        tenantId,
        createdBy: alice,
        status: 'DRAFT',
        orderedQuantityValue: 100n,
        orderedQuantityUom: 'pcs',
        totalAmountSatang: 20_000_00n,
        totalAmountCurrency: 'THB',
        producedQuantityValue: 0n,
        producedQuantityUom: 'pcs',
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.bomLine.deleteMany({
      where: { productionOrderId: orderId },
    });
    await prisma.bomLine.create({
      data: {
        id: randomUUID(),
        tenantId,
        productionOrderId: orderId,
        sku: 'RAW-A',
        requiredPerUnitValue: 2n,
        requiredPerUnitUom: 'kg',
        scrapBasisPoints: 500n,
        yieldBasisPoints: 9_500n,
        minPackValue: 10n,
        minPackUom: 'kg',
      },
    });

    await prisma.stockLevel.upsert({
      where: { tenantId_sku: { tenantId, sku: 'RAW-A' } },
      update: { onHandValue: 500n, onHandUom: 'kg' },
      create: {
        id: randomUUID(),
        tenantId,
        sku: 'RAW-A',
        onHandValue: 500n,
        onHandUom: 'kg',
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `Seeded tenant "${tenantId}" with order "${orderId}" and 500 kg of RAW-A stock.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
