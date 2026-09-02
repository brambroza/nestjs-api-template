import { randomBytes, randomUUID, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Same format as ScryptPasswordHasher — "<salt-hex>:<key-hex>". */
async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, 32);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Development seed. Creates:
 *   - tenant-demo
 *   - roles: admin / creator / approver / planner / shopfloor
 *   - users: admin@demo.local (pw: admin123!) + operator@demo.local
 *   - demo production order + BOM + stock
 *
 * Idempotent — safe to re-run. Not for production.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenantId = 'tenant-demo';
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

    // Roles — permissionsJson matches ability.factory shape
    const roles: Array<{ id: string; name: string; rules: unknown[] }> = [
      {
        id: 'role-admin',
        name: 'admin',
        rules: [{ action: 'manage', subject: 'all' }],
      },
      {
        id: 'role-creator',
        name: 'creator',
        rules: [
          { action: 'create', subject: 'ProductionOrder' },
          { action: 'read', subject: 'ProductionOrder' },
          { action: 'submit', subject: 'ProductionOrderSubmit' },
          { action: 'cancel', subject: 'ProductionOrderCancel' },
        ],
      },
      {
        id: 'role-approver',
        name: 'approver',
        rules: [
          { action: 'read', subject: 'ProductionOrder' },
          { action: 'approve', subject: 'ProductionOrderApprove' },
        ],
      },
      {
        id: 'role-planner',
        name: 'planner',
        rules: [
          { action: 'read', subject: 'ProductionOrder' },
          { action: 'release', subject: 'ProductionOrderRelease' },
          { action: 'cancel', subject: 'ProductionOrderCancel' },
        ],
      },
      {
        id: 'role-shopfloor',
        name: 'shopfloor',
        rules: [
          { action: 'read', subject: 'ProductionOrder' },
          { action: 'reportProgress', subject: 'ProductionOrderReport' },
        ],
      },
    ];

    for (const r of roles) {
      await prisma.role.upsert({
        where: { tenantId_name: { tenantId, name: r.name } },
        update: { permissionsJson: JSON.stringify(r.rules) },
        create: {
          id: r.id,
          tenantId,
          name: r.name,
          permissionsJson: JSON.stringify(r.rules),
          isSystem: true,
        },
      });
    }

    // Users
    const adminHash = await hashPassword('admin123!');
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'admin@demo.local' } },
      update: { passwordHash: adminHash },
      create: {
        id: 'user-admin',
        tenantId,
        email: 'admin@demo.local',
        passwordHash: adminHash,
        displayName: 'Demo Admin',
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: 'user-admin', roleId: 'role-admin' } },
      update: {},
      create: { userId: 'user-admin', roleId: 'role-admin' },
    });

    const operatorHash = await hashPassword('operator123!');
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'operator@demo.local' } },
      update: { passwordHash: operatorHash },
      create: {
        id: 'user-operator',
        tenantId,
        email: 'operator@demo.local',
        passwordHash: operatorHash,
        displayName: 'Demo Operator',
      },
    });
    for (const roleId of ['role-creator', 'role-planner', 'role-shopfloor']) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: 'user-operator', roleId } },
        update: {},
        create: { userId: 'user-operator', roleId },
      });
    }

    // Production-order demo
    await prisma.productionOrder.upsert({
      where: { id: orderId },
      update: {},
      create: {
        id: orderId,
        tenantId,
        createdBy: 'user-operator',
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
    console.log(`Seeded tenant "${tenantId}".
  Roles: admin, creator, approver, planner, shopfloor
  Users:
    admin@demo.local / admin123!    (roles: admin)
    operator@demo.local / operator123!  (roles: creator, planner, shopfloor)
  Order: ${orderId} (DRAFT) + BOM RAW-A + 500 kg stock`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
