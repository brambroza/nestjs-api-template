import { Module } from '@nestjs/common';

import { CustomerModule } from './customer/customer.module';
import { ItemModule } from './item/item.module';
import { UomModule } from './uom/uom.module';
import { VendorModule } from './vendor/vendor.module';

/**
 * Aggregates all master-data submodules. UserModule sits outside on
 * purpose — it is global (imported at the app root) so PoliciesGuard
 * can inject USER_PERMISSIONS without cyclic imports.
 */
@Module({
  imports: [UomModule, ItemModule, CustomerModule, VendorModule],
  exports: [UomModule, ItemModule, CustomerModule, VendorModule],
})
export class MasterDataModule {}
