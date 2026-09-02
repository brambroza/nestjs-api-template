import {
  ConflictException,
  Injectable,
  Logger,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';

import { PrismaService } from '../database';

/**
 * Idempotency-Key middleware. Applied to POST/PUT/PATCH under the
 * global API prefix. If the client sends `Idempotency-Key: <k>`, we
 * store the (tenantId, key) with the request-body hash and the
 * response, then replay the response on repeat within 24 hours.
 *
 * Uses the existing OutboxMessage table's `idempotency_key unique` is
 * not the right fit (that's for delivered events); a dedicated
 * `idempotency_record` table lands in Phase A alongside master-data.
 * For now this middleware is a NO-OP wrapper that RECORDS the header
 * into a log line — the full storage-backed dedupe is documented as
 * follow-up (see comment). This keeps the header shape stable so
 * clients can already start sending it.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private readonly _prisma: PrismaService) {
    // Prisma is injected so a follow-up upgrade can replace this
    // no-op with a real DB-backed record. Constructor stays stable.
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      next();
      return;
    }
    const key = req.header('idempotency-key');
    if (!key || key.trim().length === 0) {
      next();
      return;
    }
    if (key.length > 128) {
      throw new ConflictException('Idempotency-Key too long (max 128)');
    }
    const bodyHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');
    this.logger.debug(
      { key, bodyHash },
      'Idempotency-Key received (storage-backed dedupe is a Phase-A follow-up)',
    );
    // Attach hash so a downstream handler / follow-up storage can pick it up.
    (
      req as Request & { idempotencyKey?: string; idempotencyBodyHash?: string }
    ).idempotencyKey = key;
    (req as Request & { idempotencyBodyHash?: string }).idempotencyBodyHash =
      bodyHash;
    next();
  }
}
