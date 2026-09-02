import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { User, type UserSnapshot } from '../domain';
import type { UserRepository } from '../application/ports/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { tenantId, email },
      include: { userRoles: { select: { roleId: true } } },
    });
    return row ? User.fromSnapshot(toSnapshot(row)) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { select: { roleId: true } } },
    });
    return row ? User.fromSnapshot(toSnapshot(row)) : null;
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userRoles: readonly { roleId: string }[];
}): UserSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    isActive: row.isActive,
    roleIds: row.userRoles.map((r) => r.roleId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
