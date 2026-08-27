import { Injectable } from '@nestjs/common';

import type { Clock } from '../../application/ports/clock.port';

@Injectable()
export class SystemClockService implements Clock {
  now(): Date {
    return new Date();
  }
}
