import { Module } from '@nestjs/common';

import { BranchModule } from './branch/branch.module';
import { CompanyModule } from './company/company.module';
import { CustomerModule } from './customer/customer.module';
import { ItemModule } from './item/item.module';
import { PartnerModule } from './partner/partner.module';
import { UomModule } from './uom/uom.module';
import { VendorModule } from './vendor/vendor.module';
import { WarehouseModule } from './warehouse/warehouse.module';

/**
 * Aggregates all master-data submodules. UserModule sits outside on
 * purpose — it is global (imported at the app root) so PoliciesGuard
 * can inject USER_PERMISSIONS without cyclic imports.
 *
 * Sub-modules never import each other. Cross-aggregate reads (branch →
 * company, warehouse → branch, item → uom, partner → customer/vendor)
 * go through a narrow lookup port owned by the consuming module, with a
 * Prisma adapter that reads the other table directly. dependency-cruiser
 * enforces this.
 */
@Module({
  imports: [
    CompanyModule,
    BranchModule,
    WarehouseModule,
    UomModule,
    ItemModule,
    CustomerModule,
    VendorModule,
    PartnerModule,
  ],
  exports: [
    CompanyModule,
    BranchModule,
    WarehouseModule,
    UomModule,
    ItemModule,
    CustomerModule,
    VendorModule,
    PartnerModule,
  ],
})
export class MasterDataModule {}
