import { Module } from '@nestjs/common';

import { MasterDataModule } from './modules/master-data/master-data.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProductionOrderModule } from './modules/production-order/production-order.module';

@Module({
  imports: [ProductionOrderModule, MasterDataModule, NotificationModule],
})
export class AppModule {}
