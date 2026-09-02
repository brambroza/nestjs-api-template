import { Module } from '@nestjs/common';

import { BomModule } from './bom/bom.module';
import { BranchModule } from './branch/branch.module';
import { CompanyModule } from './company/company.module';
import { CustomerModule } from './customer/customer.module';
import { FinanceModule } from './finance/finance.module';
import { ItemCategoryModule } from './item-category/item-category.module';
import { ItemModule } from './item/item.module';
import { PartnerModule } from './partner/partner.module';
import { PriceListModule } from './price-list/price-list.module';
import { UomModule } from './uom/uom.module';
import { VendorModule } from './vendor/vendor.module';
import { WarehouseModule } from './warehouse/warehouse.module';

/**
 * Aggregates all master-data submodules. UserModule sits outside on
 * purpose — it is global (imported at the app root) so PoliciesGuard
 * can inject USER_PERMISSIONS without cyclic imports.
 *
 * Sub-modules never import each other. Cross-aggregate reads (branch →
 * company, warehouse → branch, item → uom/category, partner →
 * customer/vendor, price-list → item/customer/uom, bom → item) go
 * through a narrow lookup port owned by the consuming module, with a
 * Prisma adapter that reads the other table directly. dependency-cruiser
 * enforces this.
 */
@Module({
  imports: [
    CompanyModule,
    BranchModule,
    WarehouseModule,
    UomModule,
    ItemCategoryModule,
    ItemModule,
    CustomerModule,
    VendorModule,
    PartnerModule,
    PriceListModule,
    BomModule,
    FinanceModule,
  ],
  exports: [
    CompanyModule,
    BranchModule,
    WarehouseModule,
    UomModule,
    ItemCategoryModule,
    ItemModule,
    CustomerModule,
    VendorModule,
    PartnerModule,
    PriceListModule,
    BomModule,
    FinanceModule,
  ],
})
export class MasterDataModule {}
