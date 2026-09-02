import { Global, Module } from '@nestjs/common';

import { CLOCK } from './clock.port';
import { SystemClockService } from './system-clock.service';

/**
 * Provides Clock globally so every feature module can inject CLOCK
 * without wiring the adapter. Tests override this in Test.createTestingModule
 * with a fake clock as usual.
 */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClockService }],
  exports: [CLOCK],
})
export class ClockModule {}
