import type { User } from '../../domain';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
}
