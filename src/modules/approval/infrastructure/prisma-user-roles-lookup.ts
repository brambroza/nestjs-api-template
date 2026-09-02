import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import type { UserRolesLookup } from '../application/ports/user-roles-lookup.port';

/** Reads app_user_role -> app_role.name directly; no import of the user module. */
@Injectable()
export class PrismaUserRolesLookup implements UserRolesLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async rolesOf(tenantId: string, userId: string): Promise<readonly string[]> {
    const rows = await this.txm.getClient().userRole.findMany({
      where: { userId, user: { tenantId, isActive: true } },
      select: { role: { select: { name: true } } },
    });
    return rows.map((r) => r.role.name);
  }

  async userExists(tenantId: string, userId: string): Promise<boolean> {
    const row = await this.txm.getClient().user.findFirst({
      where: { tenantId, id: userId, isActive: true },
      select: { id: true },
    });
    return row !== null;
  }
}
