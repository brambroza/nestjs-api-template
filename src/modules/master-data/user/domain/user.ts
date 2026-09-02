import { DomainError } from '../../../../shared/errors';

/**
 * Pure-TS User aggregate. Holds identity + credential hash + role
 * assignments; no HTTP, no ORM. The password hash lives here so the
 * domain can compare "before" vs "after" on updates without leaking
 * infrastructure into use cases.
 */

export class InvalidCredentialsError extends DomainError {
  readonly code = 'AUTH.INVALID_CREDENTIALS';
  constructor() {
    super('email or password is incorrect');
  }
}

export class UserInactiveError extends DomainError {
  readonly code = 'AUTH.USER_INACTIVE';
  constructor(readonly userId: string) {
    super(`User ${userId} is deactivated`);
  }
}

export interface UserSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly roleIds: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class User {
  private constructor(private readonly s: UserSnapshot) {}

  static fromSnapshot(s: UserSnapshot): User {
    return new User(s);
  }

  get id(): string {
    return this.s.id;
  }
  get tenantId(): string {
    return this.s.tenantId;
  }
  get email(): string {
    return this.s.email;
  }
  get displayName(): string {
    return this.s.displayName;
  }
  get isActive(): boolean {
    return this.s.isActive;
  }
  get passwordHash(): string {
    return this.s.passwordHash;
  }
  get roleIds(): readonly string[] {
    return this.s.roleIds;
  }

  snapshot(): UserSnapshot {
    return this.s;
  }
}
