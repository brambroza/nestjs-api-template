import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { parsePermissionsJson, type PermissionRule } from '../domain';
import type { UserPermissionsProvider } from '../application/ports/permissions.port';

/**
 * Reads a user's role rows and merges every rule from every role.
 * Malformed permissionsJson is logged + skipped (one bad role does
 * not lock the user out of the whole tenant).
 */
@Injectable()
export class PrismaUserPermissions implements UserPermissionsProvider {
  private readonly logger = new Logger(PrismaUserPermissions.name);

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<readonly PermissionRule[]> {
    const roleRows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { id: true, permissionsJson: true } } },
    });
    const rules: PermissionRule[] = [];
    for (const r of roleRows) {
      try {
        for (const rule of parsePermissionsJson(r.role.permissionsJson)) {
          rules.push(rule);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { roleId: r.role.id, reason },
          'skipping role with malformed permissionsJson',
        );
      }
    }
    return rules;
  }
}
