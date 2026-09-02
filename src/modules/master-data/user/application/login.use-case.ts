import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { InvalidCredentialsError, UserInactiveError } from '../domain';

import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from './ports/password-hasher.port';
import {
  USER_PERMISSIONS,
  type UserPermissionsProvider,
} from './ports/permissions.port';
import { USER_REPOSITORY, type UserRepository } from './ports/user.repository';

export interface LoginInput {
  readonly tenantId: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly tenantId: string;
    readonly email: string;
    readonly displayName: string;
    readonly roleIds: readonly string[];
  };
}

/**
 * Verifies credentials and mints a JWT whose claims match JwtStrategy's
 * validate() shape: sub, tenant_id, roles. Roles carried in the token
 * are role NAMES, not IDs — CASL policies stay readable.
 *
 * Timing: `hash + verify` runs even on unknown-email to keep the
 * response time uniform (basic mitigation for user-enumeration).
 */
@Injectable()
export class LoginUseCase {
  private static readonly DUMMY_HASH =
    // Precomputed scrypt hash of the string "invalid" — used to keep
    // verify() branches balanced when the email lookup misses.
    '00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(USER_PERMISSIONS)
    private readonly permissions: UserPermissionsProvider,
    private readonly jwt: JwtService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.tenantId, input.email);
    const okHash = await this.hasher.verify(
      input.password,
      user?.passwordHash ?? LoginUseCase.DUMMY_HASH,
    );
    if (!user || !okHash) {
      throw new InvalidCredentialsError();
    }
    if (!user.isActive) {
      throw new UserInactiveError(user.id);
    }

    // Load permissions so we could also embed them into the token if
    // desired; for now we just prove they resolve and let the guard
    // load them per-request (fresh on every call, no cache staleness).
    await this.permissions.forUser(user.id);

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenant_id: user.tenantId,
      roles: user.roleIds,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        roleIds: user.roleIds,
      },
    };
  }
}
