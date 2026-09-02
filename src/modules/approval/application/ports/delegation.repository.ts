import type { Delegation } from '../../domain';

export const DELEGATION_REPOSITORY = Symbol('DELEGATION_REPOSITORY');

export interface DelegationRepository {
  findById(tenantId: string, id: string): Promise<Delegation | null>;
  /** Active delegations TO this user whose window covers `date` (YYYY-MM-DD). */
  listActiveTo(
    tenantId: string,
    toUserId: string,
    date: string,
  ): Promise<readonly Delegation[]>;
  listFrom(
    tenantId: string,
    fromUserId: string,
  ): Promise<readonly Delegation[]>;
  create(delegation: Delegation): Promise<void>;
  save(delegation: Delegation): Promise<void>;
}
