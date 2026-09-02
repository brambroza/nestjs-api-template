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
        id: 'role-master-data-editor',
        name: 'master-data-editor',
        rules: [
          { action: 'read', subject: 'Company' },
          { action: 'create', subject: 'Company' },
          { action: 'read', subject: 'Branch' },
          { action: 'create', subject: 'Branch' },
          { action: 'read', subject: 'Warehouse' },
          { action: 'create', subject: 'Warehouse' },
          { action: 'read', subject: 'Customer' },
          { action: 'create', subject: 'Customer' },
          { action: 'read', subject: 'Vendor' },
          { action: 'create', subject: 'Vendor' },
          { action: 'read', subject: 'Item' },
          { action: 'create', subject: 'Item' },
          { action: 'read', subject: 'Uom' },
          { action: 'create', subject: 'Uom' },
          { action: 'read', subject: 'PartnerContact' },
          { action: 'create', subject: 'PartnerContact' },
          { action: 'read', subject: 'PartnerAddress' },
          { action: 'create', subject: 'PartnerAddress' },
          { action: 'read', subject: 'PdpaConsent' },
          { action: 'create', subject: 'PdpaConsent' },
        ],
      },
      {
        // Data Protection Officer: the only non-admin role that can
        // fulfil/reject data-subject requests (PDPA §41).
        id: 'role-pdpa-officer',
        name: 'pdpa-officer',
        rules: [
          { action: 'read', subject: 'Customer' },
          { action: 'read', subject: 'Vendor' },
          { action: 'read', subject: 'PartnerContact' },
          { action: 'read', subject: 'PartnerAddress' },
          { action: 'read', subject: 'PdpaConsent' },
          { action: 'create', subject: 'PdpaConsent' },
          { action: 'read', subject: 'PdpaRequest' },
          { action: 'create', subject: 'PdpaRequest' },
          { action: 'update', subject: 'PdpaRequest' },
        ],
      },
      {
        id: 'role-creator',
        name: 'creator',
        rules: [
          { action: 'create', subject: 'ProductionOrder' },
          { action: 'read', subject: 'ProductionOrder' },
          { action: 'submit', subject: 'ProductionOrderSubmit' },
          { action: 'cancel', subject: 'ProductionOrderCancel' },
          { action: 'read', subject: 'Company' },
          { action: 'read', subject: 'Branch' },
          { action: 'read', subject: 'Warehouse' },
          { action: 'read', subject: 'Customer' },
          { action: 'read', subject: 'Vendor' },
          { action: 'read', subject: 'Item' },
          { action: 'read', subject: 'Uom' },
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

    // Org structure: one company > head-office branch > default warehouse.
    // Tax ids below pass the mod-11 check digit (ThaiTaxId VO).
    await prisma.company.upsert({
      where: { tenantId_code: { tenantId, code: 'DEMO' } },
      update: {},
      create: {
        id: 'co-demo',
        tenantId,
        code: 'DEMO',
        name: 'Demo Factory',
        legalName: 'Demo Factory Co., Ltd.',
        taxId: '0105551234567',
        baseCurrency: 'THB',
      },
    });
    await prisma.branch.upsert({
      where: { tenantId_code: { tenantId, code: 'HQ' } },
      update: {},
      create: {
        id: 'br-hq',
        tenantId,
        companyId: 'co-demo',
        code: 'HQ',
        name: 'สำนักงานใหญ่',
        branchNumber: '00000',
        addressLine1: '123 ถนนสุขุมวิท',
        subDistrict: 'คลองเตย',
        district: 'คลองเตย',
        province: 'กรุงเทพมหานคร',
        postalCode: '10110',
        isHeadOffice: true,
      },
    });
    await prisma.warehouse.upsert({
      where: { tenantId_code: { tenantId, code: 'WH-MAIN' } },
      update: {},
      create: {
        id: 'wh-main',
        tenantId,
        branchId: 'br-hq',
        code: 'WH-MAIN',
        name: 'คลังสินค้าหลัก',
        isDefault: true,
      },
    });

    // Master-data seed rows — a base UoM (PCS) + one derived (BOX = 12 PCS),
    // one customer, one vendor, one item. Idempotent by (tenantId, code|sku).
    const uoms = [
      {
        id: 'uom-pcs',
        code: 'PCS',
        name: 'Piece',
        baseUomCode: null as string | null,
        conversionRatio: 1n,
      },
      {
        id: 'uom-kg',
        code: 'KG',
        name: 'Kilogram',
        baseUomCode: null as string | null,
        conversionRatio: 1n,
      },
      {
        id: 'uom-box',
        code: 'BOX',
        name: 'Box of 12',
        baseUomCode: 'PCS' as string | null,
        conversionRatio: 12n,
      },
    ];
    for (const u of uoms) {
      await prisma.uomDefinition.upsert({
        where: { tenantId_code: { tenantId, code: u.code } },
        update: {
          name: u.name,
          baseUomCode: u.baseUomCode,
          conversionRatio: u.conversionRatio,
        },
        create: {
          id: u.id,
          tenantId,
          code: u.code,
          name: u.name,
          baseUomCode: u.baseUomCode,
          conversionRatio: u.conversionRatio,
        },
      });
    }

    await prisma.item.upsert({
      where: { tenantId_sku: { tenantId, sku: 'FIN-A' } },
      update: {},
      create: {
        id: 'item-fin-a',
        tenantId,
        sku: 'FIN-A',
        name: 'Finished Product A',
        description: 'Demo finished good — assembled from RAW-A',
        defaultUomCode: 'PCS',
      },
    });

    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId, code: 'CUST-001' } },
      update: {},
      create: {
        id: 'cust-001',
        tenantId,
        code: 'CUST-001',
        name: 'Demo Customer Co., Ltd.',
        taxId: '0105551234567',
        creditLimitSatang: 1_000_000_00n,
        paymentTermsDays: 30,
      },
    });

    await prisma.vendor.upsert({
      where: { tenantId_code: { tenantId, code: 'VEND-001' } },
      update: {},
      create: {
        id: 'vend-001',
        tenantId,
        code: 'VEND-001',
        name: 'Demo Supplier Co., Ltd.',
        taxId: '0105557654321',
        paymentTermsDays: 45,
      },
    });

    // Partner sub-resources for CUST-001: a primary contact, a billing
    // address carrying the customer's own branch number, and one consent.
    await prisma.partnerContact.upsert({
      where: { id: 'ct-cust-001-1' },
      update: {},
      create: {
        id: 'ct-cust-001-1',
        tenantId,
        partnerType: 'CUSTOMER',
        partnerId: 'cust-001',
        fullName: 'สมชาย ใจดี',
        position: 'Purchasing Manager',
        email: 'somchai@demo-customer.local',
        phone: '081-234-5678',
        isPrimary: true,
      },
    });
    await prisma.partnerAddress.upsert({
      where: { id: 'ad-cust-001-bill' },
      update: {},
      create: {
        id: 'ad-cust-001-bill',
        tenantId,
        partnerType: 'CUSTOMER',
        partnerId: 'cust-001',
        addressType: 'BILLING',
        label: 'สำนักงานใหญ่',
        line1: '99 ถนนพระราม 9',
        subDistrict: 'ห้วยขวาง',
        district: 'ห้วยขวาง',
        province: 'กรุงเทพมหานคร',
        postalCode: '10310',
        countryCode: 'TH',
        branchNumber: '00000',
        isDefault: true,
      },
    });
    await prisma.pdpaConsent.upsert({
      where: { id: 'consent-cust-001-1' },
      update: {},
      create: {
        id: 'consent-cust-001-1',
        tenantId,
        partnerType: 'CUSTOMER',
        partnerId: 'cust-001',
        contactId: 'ct-cust-001-1',
        purpose: 'MARKETING',
        action: 'GRANT',
        source: 'PAPER_FORM',
        evidenceRef: 'consent-form-2026-001.pdf',
        recordedBy: 'user-admin',
        recordedAt: new Date('2026-01-15T03:00:00.000Z'),
      },
    });

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
  Roles: admin, master-data-editor, pdpa-officer, creator, approver, planner, shopfloor
  Users:
    admin@demo.local / admin123!    (roles: admin)
    operator@demo.local / operator123!  (roles: creator, planner, shopfloor)
  Org: Company DEMO > Branch HQ (00000) > Warehouse WH-MAIN (default)
  Master data: UoM (PCS, KG, BOX), Item FIN-A, Customer CUST-001, Vendor VEND-001
  Partner: CUST-001 has 1 primary contact, 1 default BILLING address, 1 MARKETING consent
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
