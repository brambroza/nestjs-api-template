import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  Account,
  AccountNotFoundError,
  DuplicateAccountCodeError,
  buildAccountTree,
  type AccountTreeNode,
  type AccountType,
} from '../domain';

import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from './ports/account.repository';

export interface CreateAccountInput {
  readonly code: string;
  readonly name: string;
  readonly nameTh?: string | null;
  readonly type: AccountType;
  readonly parentId?: string | null;
  readonly isPostable?: boolean;
}

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly repo: AccountRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateAccountInput): Promise<Account> {
    const tenantId = this.tenant.getTenantId();
    const parentId = (input.parentId ?? '').trim() || null;
    const [dup, parent] = await Promise.all([
      this.repo.findByCode(tenantId, input.code.trim().toUpperCase()),
      parentId === null ? null : this.repo.findById(tenantId, parentId),
    ]);
    if (dup) throw new DuplicateAccountCodeError(input.code);
    if (parentId !== null && (!parent || !parent.snapshot().isActive)) {
      throw new AccountNotFoundError(parentId);
    }
    const account = Account.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      nameTh: input.nameTh ?? null,
      type: input.type,
      parent: parent ? parent.snapshot() : null,
      isPostable: input.isPostable,
      now: this.clock.now(),
    });
    await this.repo.create(account);
    return account;
  }
}

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly repo: AccountRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Account> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new AccountNotFoundError(id);
    return found;
  }
}

@Injectable()
export class ListAccountTreeUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly repo: AccountRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: { readonly activeOnly?: boolean } = {},
  ): Promise<readonly AccountTreeNode[]> {
    const all = await this.repo.listAll(this.tenant.getTenantId(), {
      activeOnly: input.activeOnly ?? true,
    });
    return buildAccountTree(all.map((a) => a.snapshot()));
  }
}
