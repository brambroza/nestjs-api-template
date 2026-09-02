import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './shared/config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');

  app.use(
    helmet({
      // Swagger UI needs inline scripts + eval. Disable CSP in dev, tighten
      // in prod (adjust for your reverse proxy / CSP endpoint).
      contentSecurityPolicy: appConfig.env === 'production',
    }),
  );
  app.use(compression());
  app.useBodyParser('json', { limit: appConfig.bodyLimit });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: appConfig.bodyLimit,
  });

  if (appConfig.corsOrigins.length > 0) {
    app.enableCors({
      origin: appConfig.corsOrigins.includes('*')
        ? true
        : [...appConfig.corsOrigins],
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-Id',
        'X-User-Id',
        'X-Roles',
        'X-Request-Id',
        'Idempotency-Key',
      ],
    });
  }

  app.setGlobalPrefix(appConfig.apiPrefix, {
    // Health checks stay unprefixed so K8s probe paths don't drift.
    exclude: ['health', 'ready'],
  });

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
