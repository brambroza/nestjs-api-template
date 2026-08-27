import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

import { PrismaHealthIndicator } from './prisma.health';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  /** Liveness — the process is up. Cheap check, no external calls. */
  @Get('health')
  @HealthCheck()
  liveness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024),
    ]);
  }

  /** Readiness — dependencies are reachable. Fails if DB is down. */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.prismaHealth.check('database')]);
  }
}
