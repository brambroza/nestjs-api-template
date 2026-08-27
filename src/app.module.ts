import { Module } from '@nestjs/common';

import { MasterDataModule } from './modules/master-data/master-data.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProductionOrderModule } from './modules/production-order/production-order.module';
import { AppClsModule } from './shared/cls';
import { AppConfigModule } from './shared/config';
import { AppLoggerModule } from './shared/logging';

@Module({
  imports: [
    AppConfigModule,
    AppClsModule,
    AppLoggerModule,
    ProductionOrderModule,
    MasterDataModule,
    NotificationModule,
  ],
})
export class AppModule {}
