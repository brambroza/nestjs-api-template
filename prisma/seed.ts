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
          { action: 'read', subject: 'ItemCategory' },
          { action: 'create', subject: 'ItemCategory' },
          { action: 'read', subject: 'PriceList' },
          { action: 'create', subject: 'PriceList' },
          { action: 'read', subject: 'Bom' },
          { action: 'create', subject: 'Bom' },
          { action: 'update', subject: 'Bom' },
          { action: 'read', subject: 'Currency' },
          { action: 'read', subject: 'FxRate' },
          { action: 'read', subject: 'TaxCode' },
          { action: 'read', subject: 'Account' },
          { action: 'read', subject: 'FiscalYear' },
        ],
      },
      {
        // Finance administrator: owns currencies, FX, tax codes, the
        // chart of accounts and period locks (EPIC-A.4).
        id: 'role-finance-admin',
        name: 'finance-admin',
        rules: [
          { action: 'read', subject: 'Company' },
          { action: 'read', subject: 'Item' },
          { action: 'manage', subject: 'Currency' },
          { action: 'manage', subject: 'FxRate' },
          { action: 'manage', subject: 'TaxCode' },
          { action: 'manage', subject: 'Account' },
          { action: 'manage', subject: 'FiscalYear' },
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
        // Approve sales documents; Phase B sales module grants more.
        id: 'role-sales-manager',
        name: 'sales-manager',
        rules: [
          { action: 'manage', subject: 'Quotation' },
          { action: 'read', subject: 'Customer' },
          { action: 'read', subject: 'Item' },
          { action: 'read', subject: 'PriceList' },
          { action: 'read', subject: 'ApprovalRequest' },
          { action: 'update', subject: 'ApprovalRequest' },
          { action: 'read', subject: 'ApprovalDelegation' },
          { action: 'create', subject: 'ApprovalDelegation' },
          { action: 'update', subject: 'ApprovalDelegation' },
        ],
      },
      {
        id: 'role-purchasing-manager',
        name: 'purchasing-manager',
        rules: [
          { action: 'read', subject: 'Vendor' },
          { action: 'read', subject: 'Item' },
          { action: 'read', subject: 'ApprovalRequest' },
          { action: 'update', subject: 'ApprovalRequest' },
          { action: 'read', subject: 'ApprovalDelegation' },
          { action: 'create', subject: 'ApprovalDelegation' },
          { action: 'update', subject: 'ApprovalDelegation' },
        ],
      },
      {
        id: 'role-sales',
        name: 'sales',
        rules: [
          { action: 'manage', subject: 'Quotation' },
          { action: 'read', subject: 'Company' },
          { action: 'read', subject: 'Customer' },
          { action: 'read', subject: 'Item' },
          { action: 'read', subject: 'Uom' },
          { action: 'read', subject: 'PriceList' },
          { action: 'read', subject: 'TaxCode' },
          { action: 'read', subject: 'Currency' },
          { action: 'read', subject: 'PartnerContact' },
          { action: 'read', subject: 'PartnerAddress' },
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

    // Manager: decides SO / PO approvals (Phase B).
    const managerHash = await hashPassword('manager123!');
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'manager@demo.local' } },
      update: { passwordHash: managerHash },
      create: {
        id: 'user-manager',
        tenantId,
        email: 'manager@demo.local',
        passwordHash: managerHash,
        displayName: 'Demo Manager',
      },
    });
    for (const roleId of ['role-sales-manager', 'role-purchasing-manager', 'role-approver']) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: 'user-manager', roleId } },
        update: {},
        create: { userId: 'user-manager', roleId },
      });
    }

    // Sales rep: owns quotations (EPIC-B.1).
    const salesHash = await hashPassword('sales123!');
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'sales@demo.local' } },
      update: { passwordHash: salesHash },
      create: {
        id: 'user-sales',
        tenantId,
        email: 'sales@demo.local',
        passwordHash: salesHash,
        displayName: 'Demo Sales Rep',
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: 'user-sales', roleId: 'role-sales' } },
      update: {},
      create: { userId: 'user-sales', roleId: 'role-sales' },
    });

    // Approval matrices (EPIC-B.4). Amounts in satang.
    const policiesSeed = [
      {
        id: 'apv-so', documentType: 'SALES_ORDER', name: 'Sales order approval',
        steps: [
          { id: 'apv-so-1', stepNo: 1, name: 'Sales manager', approverRole: 'sales-manager', minAmountMinor: null as bigint | null },
          { id: 'apv-so-2', stepNo: 2, name: 'Finance (>= 500,000)', approverRole: 'finance-admin', minAmountMinor: 500_000_00n as bigint | null },
        ],
      },
      {
        id: 'apv-pr', documentType: 'PURCHASE_REQUISITION', name: 'PR approval',
        steps: [
          { id: 'apv-pr-1', stepNo: 1, name: 'Purchasing manager', approverRole: 'purchasing-manager', minAmountMinor: null as bigint | null },
        ],
      },
      {
        id: 'apv-po', documentType: 'PURCHASE_ORDER', name: 'PO approval matrix',
        steps: [
          { id: 'apv-po-1', stepNo: 1, name: 'Purchasing manager', approverRole: 'purchasing-manager', minAmountMinor: null as bigint | null },
          { id: 'apv-po-2', stepNo: 2, name: 'Finance (>= 200,000)', approverRole: 'finance-admin', minAmountMinor: 200_000_00n as bigint | null },
          { id: 'apv-po-3', stepNo: 3, name: 'Admin (>= 2,000,000)', approverRole: 'admin', minAmountMinor: 2_000_000_00n as bigint | null },
        ],
      },
    ];
    for (const p of policiesSeed) {
      await prisma.approvalPolicy.upsert({
        where: { id: p.id },
        update: { name: p.name, isActive: true },
        create: {
          id: p.id,
          tenantId,
          documentType: p.documentType,
          name: p.name,
          steps: {
            create: p.steps.map((s) => ({
              id: s.id,
              tenantId,
              stepNo: s.stepNo,
              name: s.name,
              approverRole: s.approverRole,
              minAmountMinor: s.minAmountMinor,
              requiredApprovals: 1,
            })),
          },
        },
      });
    }

    // Item categories: FG (root), RM (root) > RM-STEEL (child)
    const categories = [
      { id: 'cat-fg', code: 'FG', name: 'Finished goods', parentId: null as string | null, path: '/cat-fg/', depth: 0 },
      { id: 'cat-rm', code: 'RM', name: 'Raw materials', parentId: null as string | null, path: '/cat-rm/', depth: 0 },
      { id: 'cat-rm-steel', code: 'RM-STEEL', name: 'Steel', parentId: 'cat-rm' as string | null, path: '/cat-rm/cat-rm-steel/', depth: 1 },
    ];
    for (const c of categories) {
      await prisma.itemCategory.upsert({
        where: { tenantId_code: { tenantId, code: c.code } },
        update: { name: c.name, parentId: c.parentId, path: c.path, depth: c.depth },
        create: { ...c, tenantId },
      });
    }

    await prisma.item.upsert({
      where: { tenantId_sku: { tenantId, sku: 'FIN-A' } },
      update: { categoryId: 'cat-fg' },
      create: {
        id: 'item-fin-a',
        tenantId,
        sku: 'FIN-A',
        name: 'Finished Product A',
        description: 'Demo finished good — assembled from RAW-A',
        defaultUomCode: 'PCS',
        categoryId: 'cat-fg',
        trackingPolicy: 'SERIAL',
      },
    });
    await prisma.item.upsert({
      where: { tenantId_sku: { tenantId, sku: 'RAW-A' } },
      update: { categoryId: 'cat-rm' },
      create: {
        id: 'item-raw-a',
        tenantId,
        sku: 'RAW-A',
        name: 'Raw Material A',
        defaultUomCode: 'KG',
        categoryId: 'cat-rm',
        trackingPolicy: 'LOT',
        shelfLifeDays: 365,
      },
    });

    // Master BOM for FIN-A v1 (active): 2 KG of RAW-A per unit, 5 % scrap,
    // 95 % yield, 10 KG packs. Production orders with productSku FIN-A
    // resolve this at release (T-125).
    await prisma.bom.upsert({
      where: { id: 'bom-fin-a-v1' },
      update: { isActive: true },
      create: {
        id: 'bom-fin-a-v1',
        tenantId,
        itemId: 'item-fin-a',
        productSku: 'FIN-A',
        version: 1,
        name: 'FIN-A standard',
        isActive: true,
        components: {
          create: [
            {
              id: 'bomc-fin-a-v1-1',
              tenantId,
              lineNo: 1,
              componentItemId: 'item-raw-a',
              componentSku: 'RAW-A',
              qtyPerUnitValue: 2n,
              qtyPerUnitUom: 'KG',
              scrapBasisPoints: 500n,
              yieldBasisPoints: 9_500n,
              minPackValue: 10n,
              minPackUom: 'KG',
            },
          ],
        },
      },
    });

    // Price lists: a general 2026 list with a 10+ tier, and a VIP list
    // for CUST-001 that beats it regardless of quantity (T-123).
    const priceLists = [
      { id: 'pl-std-2026', code: 'STD-2026', name: 'Standard 2026', customerId: null as string | null },
      { id: 'pl-vip-cust-001', code: 'VIP-CUST-001', name: 'VIP — Demo Customer', customerId: 'cust-001' as string | null },
    ];
    for (const pl of priceLists) {
      await prisma.priceList.upsert({
        where: { tenantId_code: { tenantId, code: pl.code } },
        update: {},
        create: {
          ...pl,
          tenantId,
          currency: 'THB',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: new Date('2026-12-31T23:59:59.000Z'),
        },
      });
    }
    const priceLines = [
      { id: 'pll-std-1', priceListId: 'pl-std-2026', minQty: 1n, unitPriceSatang: 1_500_00n },
      { id: 'pll-std-10', priceListId: 'pl-std-2026', minQty: 10n, unitPriceSatang: 1_400_00n },
      { id: 'pll-vip-1', priceListId: 'pl-vip-cust-001', minQty: 1n, unitPriceSatang: 1_450_00n },
    ];
    for (const l of priceLines) {
      await prisma.priceListLine.upsert({
        where: { id: l.id },
        update: { unitPriceSatang: l.unitPriceSatang },
        create: { ...l, tenantId, itemId: 'item-fin-a', uomCode: 'PCS' },
      });
    }

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

    // Demo quotation QT-202609-0001 rev 1 (DRAFT): 10 x FIN-A @ 1,400.00 + VAT 7 %.
    await prisma.documentSequence.upsert({
      where: { tenantId_key: { tenantId, key: 'QT:202609' } },
      update: {},
      create: { tenantId, key: 'QT:202609', nextValue: 2 },
    });
    await prisma.quotation.upsert({
      where: { tenantId_number_revision: { tenantId, number: 'QT-202609-0001', revision: 1 } },
      update: {},
      create: {
        id: 'qt-demo-1',
        tenantId,
        companyId: 'co-demo',
        number: 'QT-202609-0001',
        revision: 1,
        customerId: 'cust-001',
        currency: 'THB',
        quoteDate: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-09-30T00:00:00.000Z'),
        status: 'DRAFT',
        paymentTermsDays: 30,
        notes: 'ตัวอย่างใบเสนอราคา',
        subtotalMinor: 14_000_00n,
        discountMinor: 0n,
        taxMinor: 980_00n,
        totalMinor: 14_980_00n,
        version: 0,
        createdBy: 'user-sales',
        createdAt: new Date('2026-09-01T02:00:00.000Z'),
        lines: {
          create: [
            {
              id: 'qtl-demo-1',
              tenantId,
              lineNo: 1,
              itemId: 'item-fin-a',
              itemSku: 'FIN-A',
              description: 'Finished Product A',
              uomCode: 'PCS',
              quantity: 10n,
              unitPriceMinor: 1_400_00n,
              priceSource: 'PRICE_LIST',
              priceListId: 'pl-std-2026',
              discountBp: 0,
              discountMinor: 0n,
              netMinor: 14_000_00n,
              taxCodeId: 'tax-vat7',
              taxCode: 'VAT7',
              taxRateBp: 700,
              taxMinor: 980_00n,
              totalMinor: 14_980_00n,
            },
          ],
        },
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

    // ---- Financial configuration (EPIC-A.4) ---------------------------
    const currenciesSeed = [
      { id: 'cur-thb', code: 'THB', name: 'Thai Baht', minorUnits: 2 },
      { id: 'cur-usd', code: 'USD', name: 'US Dollar', minorUnits: 2 },
      { id: 'cur-jpy', code: 'JPY', name: 'Japanese Yen', minorUnits: 0 },
    ];
    for (const c of currenciesSeed) {
      await prisma.currency.upsert({
        where: { tenantId_code: { tenantId, code: c.code } },
        update: { name: c.name, minorUnits: c.minorUnits },
        create: { ...c, tenantId },
      });
    }
    // Manual reference rates (1 quote = rateScaled/1e6 THB). The BOT cron
    // fills subsequent days when BOT_API_CLIENT_ID is configured.
    const fxSeed = [
      { id: 'fx-usd-20260901', quoteCurrency: 'USD', rateScaled: 33_123_400n },
      { id: 'fx-jpy-20260901', quoteCurrency: 'JPY', rateScaled: 225_000n },
    ];
    for (const r of fxSeed) {
      const rateDate = new Date('2026-09-01T00:00:00.000Z');
      await prisma.fxRate.upsert({
        where: {
          tenantId_baseCurrency_quoteCurrency_rateDate: {
            tenantId,
            baseCurrency: 'THB',
            quoteCurrency: r.quoteCurrency,
            rateDate,
          },
        },
        update: { rateScaled: r.rateScaled },
        create: {
          id: r.id,
          tenantId,
          baseCurrency: 'THB',
          quoteCurrency: r.quoteCurrency,
          rateDate,
          rateScaled: r.rateScaled,
          source: 'MANUAL',
          fetchedAt: new Date('2026-09-01T11:30:00.000Z'),
          createdBy: 'user-admin',
        },
      });
    }

    // Thai tax codes: VAT 7 % default, zero-rated, exempt; WHT 1/3/5 %.
    const taxSeed = [
      { id: 'tax-vat7', code: 'VAT7', name: 'VAT 7%', kind: 'VAT', rateBasisPoints: 700n, vatTreatment: 'STANDARD', pndForm: null as string | null, whtIncomeType: null as string | null, isDefault: true },
      { id: 'tax-vat0', code: 'VAT0', name: 'VAT 0% (export)', kind: 'VAT', rateBasisPoints: 0n, vatTreatment: 'ZERO_RATED', pndForm: null as string | null, whtIncomeType: null as string | null, isDefault: false },
      { id: 'tax-vat-ex', code: 'VAT-EX', name: 'VAT exempt (ยกเว้น)', kind: 'VAT', rateBasisPoints: 0n, vatTreatment: 'EXEMPT', pndForm: null as string | null, whtIncomeType: null as string | null, isDefault: false },
      { id: 'tax-wht1', code: 'WHT1', name: 'WHT 1% transport', kind: 'WHT', rateBasisPoints: 100n, vatTreatment: null as string | null, pndForm: 'PND53' as string | null, whtIncomeType: 'ค่าขนส่ง' as string | null, isDefault: false },
      { id: 'tax-wht3', code: 'WHT3', name: 'WHT 3% services', kind: 'WHT', rateBasisPoints: 300n, vatTreatment: null as string | null, pndForm: 'PND53' as string | null, whtIncomeType: 'ค่าบริการ' as string | null, isDefault: true },
      { id: 'tax-wht5', code: 'WHT5', name: 'WHT 5% rent', kind: 'WHT', rateBasisPoints: 500n, vatTreatment: null as string | null, pndForm: 'PND53' as string | null, whtIncomeType: 'ค่าเช่า' as string | null, isDefault: false },
    ];
    for (const t of taxSeed) {
      await prisma.taxCode.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        update: { rateBasisPoints: t.rateBasisPoints, isDefault: t.isDefault },
        create: { ...t, tenantId },
      });
    }

    // Minimal Thai SME chart of accounts. Headers are non-postable.
    const coa: Array<{ id: string; code: string; name: string; nameTh: string; type: string; parent: string | null; postable: boolean }> = [
      { id: 'acc-1000', code: '1000', name: 'Assets', nameTh: 'สินทรัพย์', type: 'ASSET', parent: null, postable: false },
      { id: 'acc-1100', code: '1100', name: 'Cash and bank', nameTh: 'เงินสดและเงินฝากธนาคาร', type: 'ASSET', parent: 'acc-1000', postable: true },
      { id: 'acc-1200', code: '1200', name: 'Accounts receivable', nameTh: 'ลูกหนี้การค้า', type: 'ASSET', parent: 'acc-1000', postable: true },
      { id: 'acc-1300', code: '1300', name: 'Inventory', nameTh: 'สินค้าคงเหลือ', type: 'ASSET', parent: 'acc-1000', postable: true },
      { id: 'acc-1400', code: '1400', name: 'Input VAT', nameTh: 'ภาษีซื้อ', type: 'ASSET', parent: 'acc-1000', postable: true },
      { id: 'acc-2000', code: '2000', name: 'Liabilities', nameTh: 'หนี้สิน', type: 'LIABILITY', parent: null, postable: false },
      { id: 'acc-2100', code: '2100', name: 'Accounts payable', nameTh: 'เจ้าหนี้การค้า', type: 'LIABILITY', parent: 'acc-2000', postable: true },
      { id: 'acc-2200', code: '2200', name: 'Output VAT', nameTh: 'ภาษีขาย', type: 'LIABILITY', parent: 'acc-2000', postable: true },
      { id: 'acc-2300', code: '2300', name: 'Withholding tax payable', nameTh: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', type: 'LIABILITY', parent: 'acc-2000', postable: true },
      { id: 'acc-3000', code: '3000', name: 'Equity', nameTh: 'ส่วนของผู้ถือหุ้น', type: 'EQUITY', parent: null, postable: false },
      { id: 'acc-3100', code: '3100', name: 'Share capital', nameTh: 'ทุนเรือนหุ้น', type: 'EQUITY', parent: 'acc-3000', postable: true },
      { id: 'acc-3200', code: '3200', name: 'Retained earnings', nameTh: 'กำไรสะสม', type: 'EQUITY', parent: 'acc-3000', postable: true },
      { id: 'acc-4000', code: '4000', name: 'Revenue', nameTh: 'รายได้', type: 'REVENUE', parent: null, postable: false },
      { id: 'acc-4100', code: '4100', name: 'Sales', nameTh: 'รายได้จากการขาย', type: 'REVENUE', parent: 'acc-4000', postable: true },
      { id: 'acc-5000', code: '5000', name: 'Expenses', nameTh: 'ค่าใช้จ่าย', type: 'EXPENSE', parent: null, postable: false },
      { id: 'acc-5100', code: '5100', name: 'Cost of goods sold', nameTh: 'ต้นทุนขาย', type: 'EXPENSE', parent: 'acc-5000', postable: true },
      { id: 'acc-5200', code: '5200', name: 'Salaries', nameTh: 'เงินเดือน', type: 'EXPENSE', parent: 'acc-5000', postable: true },
      { id: 'acc-5300', code: '5300', name: 'Rent', nameTh: 'ค่าเช่า', type: 'EXPENSE', parent: 'acc-5000', postable: true },
    ];
    for (const a of coa) {
      const path = a.parent ? `/${a.parent}/${a.id}/` : `/${a.id}/`;
      await prisma.account.upsert({
        where: { tenantId_code: { tenantId, code: a.code } },
        update: { name: a.name, nameTh: a.nameTh, isPostable: a.postable },
        create: {
          id: a.id,
          tenantId,
          code: a.code,
          name: a.name,
          nameTh: a.nameTh,
          type: a.type,
          parentId: a.parent,
          path,
          depth: a.parent ? 1 : 0,
          isPostable: a.postable,
        },
      });
    }

    // Fiscal year 2026 for the demo company: 12 monthly periods,
    // Jan–Jun locked at month-end to show the posting gate in action.
    await prisma.fiscalYear.upsert({
      where: { id: 'fy-2026' },
      update: {},
      create: {
        id: 'fy-2026',
        tenantId,
        companyId: 'co-demo',
        name: 'FY2026',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'OPEN',
        periods: {
          create: Array.from({ length: 12 }, (_, i) => {
            const start = new Date(Date.UTC(2026, i, 1));
            const end = new Date(Date.UTC(2026, i + 1, 0));
            const locked = i < 6;
            return {
              id: `fy-2026-p${String(i + 1).padStart(2, '0')}`,
              tenantId,
              periodNo: i + 1,
              startDate: start,
              endDate: end,
              status: locked ? 'LOCKED' : 'OPEN',
              lockedAt: locked ? new Date(Date.UTC(2026, i + 1, 5)) : null,
              lockedBy: locked ? 'user-admin' : null,
              lockReason: locked ? 'month-end close' : null,
            };
          }),
        },
      },
    });

    // Production-order demo
    await prisma.productionOrder.upsert({
      where: { id: orderId },
      update: { productSku: 'FIN-A' },
      create: {
        id: orderId,
        tenantId,
        createdBy: 'user-operator',
        status: 'DRAFT',
        productSku: 'FIN-A',
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

    // No per-order bom_line snapshot any more: the demo order resolves the
    // active master BOM for FIN-A. Rows left by older seeds would win over
    // the master BOM, so clear them.
    await prisma.bomLine.deleteMany({
      where: { productionOrderId: orderId },
    });

    await prisma.stockLevel.upsert({
      where: { tenantId_sku: { tenantId, sku: 'RAW-A' } },
      update: { onHandValue: 500n, onHandUom: 'KG' },
      create: {
        id: randomUUID(),
        tenantId,
        sku: 'RAW-A',
        onHandValue: 500n,
        onHandUom: 'KG',
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Seeded tenant "${tenantId}".
  Roles: admin, master-data-editor, pdpa-officer, finance-admin, sales, sales-manager,
    purchasing-manager, creator, approver, planner, shopfloor
  Users:
    admin@demo.local / admin123!    (roles: admin)
    operator@demo.local / operator123!  (roles: creator, planner, shopfloor)
  Org: Company DEMO > Branch HQ (00000) > Warehouse WH-MAIN (default)
  Master data: UoM (PCS, KG, BOX), Categories FG / RM > RM-STEEL,
    Items FIN-A (SERIAL, FG) + RAW-A (LOT 365d, RM), Customer CUST-001, Vendor VEND-001
  BOM: FIN-A v1 active (2 KG RAW-A/unit, 5% scrap, 95% yield, 10 KG pack)
  Price lists: STD-2026 (FIN-A 1,500.00 / 10+ 1,400.00), VIP-CUST-001 (1,450.00)
  Finance: THB/USD/JPY + rates 2026-09-01 (USD 33.1234, JPY 0.2250),
    tax VAT7* VAT0 VAT-EX WHT1 WHT3* WHT5 (* = default), 18-account Thai SME chart,
    FY2026 for co-demo (periods 1-6 LOCKED, 7-12 OPEN)
  Approval: manager@demo.local / manager123! (sales-manager, purchasing-manager, approver)
    policies SALES_ORDER (mgr; finance >= 500k), PURCHASE_REQUISITION (mgr),
    PURCHASE_ORDER (mgr; finance >= 200k; admin >= 2M)
  Sales: sales@demo.local / sales123! (sales) — quotation QT-202609-0001 rev 1 DRAFT
    (10 x FIN-A @ 1,400.00 + VAT 7% = 14,980.00, valid until 2026-09-30)
  Partner: CUST-001 has 1 primary contact, 1 default BILLING address, 1 MARKETING consent
  Order: ${orderId} (DRAFT, productSku FIN-A -> master BOM) + 500 KG RAW-A stock`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
