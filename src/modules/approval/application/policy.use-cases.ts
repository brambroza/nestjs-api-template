import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  ActiveApprovalPolicyExistsError,
  ApprovalPolicy,
  ApprovalPolicyNotFoundError,
} from '../domain';

import {
  APPROVAL_POLICY_REPOSITORY,
  type ApprovalPolicyRepository,
} from './ports/approval-policy.repository';

export interface CreateApprovalPolicyInput {
  readonly documentType: string;
  readonly name: string;
  readonly steps: readonly {
    readonly name: string;
    readonly approverRole: string;
    readonly minAmountMinor?: bigint | null;
    readonly requiredApprovals?: number;
  }[];
  /** Deactivate the current active policy for this document type in the same call. */
  readonly replaceActive?: boolean;
}

@Injectable()
export class CreateApprovalPolicyUseCase {
  constructor(
    @Inject(APPROVAL_POLICY_REPOSITORY)
    private readonly repo: ApprovalPolicyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateApprovalPolicyInput): Promise<ApprovalPolicy> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const policy = ApprovalPolicy.create({
      id: randomUUID(),
      tenantId,
      documentType: input.documentType,
      name: input.name,
      steps: input.steps.map((s) => ({ ...s, id: randomUUID() })),
      now,
    });
    const current = await this.repo.findActive(
      tenantId,
      policy.snapshot().documentType,
    );
    if (current) {
      if (!input.replaceActive) {
        throw new ActiveApprovalPolicyExistsError(
          policy.snapshot().documentType,
          current.snapshot().id,
        );
      }
      await this.repo.save(current.deactivate(now));
    }
    await this.repo.create(policy);
    return policy;
  }
}

@Injectable()
export class ListApprovalPoliciesUseCase {
  constructor(
    @Inject(APPROVAL_POLICY_REPOSITORY)
    private readonly repo: ApprovalPolicyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: { readonly activeOnly?: boolean } = {},
  ): Promise<readonly ApprovalPolicy[]> {
    return this.repo.list(this.tenant.getTenantId(), {
      activeOnly: input.activeOnly ?? true,
    });
  }
}

@Injectable()
export class GetApprovalPolicyUseCase {
  constructor(
    @Inject(APPROVAL_POLICY_REPOSITORY)
    private readonly repo: ApprovalPolicyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<ApprovalPolicy> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new ApprovalPolicyNotFoundError(id);
    return found;
  }
}

@Injectable()
export class DeactivateApprovalPolicyUseCase {
  constructor(
    @Inject(APPROVAL_POLICY_REPOSITORY)
    private readonly repo: ApprovalPolicyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<ApprovalPolicy> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new ApprovalPolicyNotFoundError(id);
    const next = found.deactivate(this.clock.now());
    await this.repo.save(next);
    return next;
  }
}
