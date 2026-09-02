import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  Delegation,
  DelegationNotFoundError,
  InvalidDelegationError,
} from '../domain';

import {
  DELEGATION_REPOSITORY,
  type DelegationRepository,
} from './ports/delegation.repository';
import {
  USER_ROLES_LOOKUP,
  type UserRolesLookup,
} from './ports/user-roles-lookup.port';

export interface CreateDelegationInput {
  readonly toUserId: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason?: string | null;
}

/** The current user lends their approval roles; nobody can delegate on another's behalf. */
@Injectable()
export class CreateDelegationUseCase {
  constructor(
    @Inject(DELEGATION_REPOSITORY) private readonly repo: DelegationRepository,
    @Inject(USER_ROLES_LOOKUP) private readonly users: UserRolesLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateDelegationInput): Promise<Delegation> {
    const tenantId = this.tenant.getTenantId();
    if (!(await this.users.userExists(tenantId, input.toUserId))) {
      throw new InvalidDelegationError(
        `toUserId "${input.toUserId}" is not a user of this tenant`,
      );
    }
    const delegation = Delegation.create({
      id: randomUUID(),
      tenantId,
      fromUserId: this.tenant.getUserId(),
      toUserId: input.toUserId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason ?? null,
      now: this.clock.now(),
    });
    await this.repo.create(delegation);
    return delegation;
  }
}

@Injectable()
export class ListMyDelegationsUseCase {
  constructor(
    @Inject(DELEGATION_REPOSITORY) private readonly repo: DelegationRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(): Promise<readonly Delegation[]> {
    return this.repo.listFrom(
      this.tenant.getTenantId(),
      this.tenant.getUserId(),
    );
  }
}

/** Only the delegator (or an admin via CASL) revokes. */
@Injectable()
export class RevokeDelegationUseCase {
  constructor(
    @Inject(DELEGATION_REPOSITORY) private readonly repo: DelegationRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Delegation> {
    const tenantId = this.tenant.getTenantId();
    const found = await this.repo.findById(tenantId, id);
    if (!found || found.snapshot().fromUserId !== this.tenant.getUserId()) {
      throw new DelegationNotFoundError(id);
    }
    const next = found.revoke();
    await this.repo.save(next);
    return next;
  }
}
