import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './shared/config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');

  if (appConfig.env !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('NestJS Production Template')
      .setDescription(
        'Production order + BOM + outbox reference implementation.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'X-Tenant-Id', in: 'header' },
        'tenant',
      )
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(appConfig.port);
}

void bootstrap();
