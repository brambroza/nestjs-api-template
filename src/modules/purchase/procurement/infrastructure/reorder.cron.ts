import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../../../../shared/cls';
import {
  REORDER_RULE_REPOSITORY,
  type ReorderRuleRepository,
} from '../application/ports/reorder.ports';
import { ReorderSweepUseCase } from '../application/reorder.use-cases';

export const REORDER_SYSTEM_USER = 'system';

/**
 * T-326: 00:30 Bangkok daily. The sweep needs a tenant context (it
 * creates requisitions through the normal use case), so each tenant
 * runs inside its own CLS scope with the system user as requester.
 */
@Injectable()
export class ReorderCron {
  private readonly logger = new Logger(ReorderCron.name);

  constructor(
    private readonly sweep: ReorderSweepUseCase,
    @Inject(REORDER_RULE_REPOSITORY)
    private readonly rules: ReorderRuleRepository,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @Cron('30 0 * * *', { timeZone: 'Asia/Bangkok' })
  async tick(): Promise<void> {
    let tenants: readonly string[];
    try {
      tenants = await this.rules.tenantsWithActiveRules();
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'reorder sweep failed to list tenants',
      );
      return;
    }
    for (const tenantId of tenants) {
      await this.cls.run(async () => {
        this.cls.set('requestId', randomUUID());
        this.cls.set('tenantId', tenantId);
        this.cls.set('userId', REORDER_SYSTEM_USER);
        try {
          const result = await this.sweep.execute();
          if (result.triggered > 0)
            this.logger.log(
              { tenantId, ...result },
              'reorder sweep raised requisitions',
            );
        } catch (err) {
          this.logger.error(
            { tenantId, err: err instanceof Error ? err.message : String(err) },
            'reorder sweep failed',
          );
        }
      });
    }
  }
}
