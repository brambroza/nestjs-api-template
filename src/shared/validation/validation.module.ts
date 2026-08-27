import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

/**
 * Global validation pipe.
 * - `whitelist` strips unknown properties so an attacker can't smuggle
 *   fields into a DTO.
 * - `forbidNonWhitelisted` upgrades that from silent stripping to a
 *   BadRequestException — smuggling attempt = loud 400.
 * - `transform` promotes the raw JSON into the DTO class instance so
 *   class-transformer decorators (@Expose, @Type) can run.
 */
@Module({
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
          transform: true,
          transformOptions: {
            enableImplicitConversion: true,
            exposeDefaultValues: true,
          },
        }),
    },
  ],
})
export class GlobalValidationModule {}
