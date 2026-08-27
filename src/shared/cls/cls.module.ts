import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';

import type { AppClsStore } from './app-cls-store';

function headerString(req: unknown, name: string): string {
  if (typeof req !== 'object' || req === null) return '';
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  if (!headers) return '';
  const raw = headers[name];
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * ADR 0001 §3.2 chose nestjs-cls over REQUEST scope. This module wires
 * ClsModule so every HTTP request, cron tick, and BullMQ job runs
 * inside a CLS context carrying requestId + (nullable) tenantId +
 * (nullable) userId. Authentication guards populate tenant/user later
 * in the pipeline; the outbox worker seeds them per job (Phase 5).
 *
 * We intentionally do NOT use ClsModule's built-in auto-tenant hooks —
 * we want the setup here transparent.
 */
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: unknown) => {
          const headerId = headerString(req, 'x-request-id');
          return headerId.length > 0 ? headerId : randomUUID();
        },
        setup: (cls, req: unknown) => {
          const store = cls as unknown as {
            set(k: keyof AppClsStore, v: unknown): void;
          };
          store.set('requestId', cls.getId());
          store.set('tenantId', null);
          store.set('userId', null);
          const tenantHeader = headerString(req, 'x-tenant-id');
          if (tenantHeader.length > 0) {
            store.set('tenantId', tenantHeader);
          }
        },
      },
    }),
  ],
  exports: [ClsModule],
})
export class AppClsModule {}
