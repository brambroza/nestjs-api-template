import type { Clock } from '../../../../shared/clock';
import type { TenantContext } from '../../../../shared/tenant';
import type { TransactionManager } from '../../../../shared/transaction';
import {
  ApprovalRequest,
  ApprovalStatus,
  type ApprovalPolicy,
  type Delegation,
} from '../../domain';
import type { ApprovalPolicyRepository } from '../ports/approval-policy.repository';
import type { ApprovalRequestRepository } from '../ports/approval-request.repository';
import type { DelegationRepository } from '../ports/delegation.repository';
import type {
  ApprovalOutbox,
  ApprovalOutboxEnvelope,
} from '../ports/outbox.port';
import type { UserRolesLookup } from '../ports/user-roles-lookup.port';

export class InMemoryPolicyRepository implements ApprovalPolicyRepository {
  readonly rows = new Map<string, ApprovalPolicy>();
  async findById(tenantId: string, id: string): Promise<ApprovalPolicy | null> {
    const p = this.rows.get(id);
    return p && p.snapshot().tenantId === tenantId ? p : null;
  }
  async findActive(
    tenantId: string,
    documentType: string,
  ): Promise<ApprovalPolicy | null> {
    return (
      [...this.rows.values()].find((p) => {
        const s = p.snapshot();
        return (
          s.tenantId === tenantId &&
          s.documentType === documentType &&
          s.isActive
        );
      }) ?? null
    );
  }
  async list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly ApprovalPolicy[]> {
    return [...this.rows.values()].filter(
      (p) =>
        p.snapshot().tenantId === tenantId &&
        (!opts.activeOnly || p.snapshot().isActive),
    );
  }
  async create(policy: ApprovalPolicy): Promise<void> {
    this.rows.set(policy.snapshot().id, policy);
  }
  async save(policy: ApprovalPolicy): Promise<void> {
    this.rows.set(policy.snapshot().id, policy);
  }
}

export class InMemoryRequestRepository implements ApprovalRequestRepository {
  readonly rows = new Map<string, ApprovalRequest>();
  private forDoc(tenantId: string, t: string, d: string): ApprovalRequest[] {
    return [...this.rows.values()]
      .filter((r) => {
        const s = r.snapshot();
        return (
          s.tenantId === tenantId && s.documentType === t && s.documentId === d
        );
      })
      .sort(
        (a, b) =>
          b.snapshot().createdAt.getTime() - a.snapshot().createdAt.getTime(),
      );
  }
  async findById(
    tenantId: string,
    id: string,
  ): Promise<ApprovalRequest | null> {
    const r = this.rows.get(id);
    return r && r.snapshot().tenantId === tenantId
      ? ApprovalRequest.fromSnapshot(r.snapshot())
      : null;
  }
  async findPendingForDocument(
    tenantId: string,
    t: string,
    d: string,
  ): Promise<ApprovalRequest | null> {
    return (
      this.forDoc(tenantId, t, d).find(
        (r) => r.snapshot().status === ApprovalStatus.Pending,
      ) ?? null
    );
  }
  async listForDocument(
    tenantId: string,
    t: string,
    d: string,
  ): Promise<readonly ApprovalRequest[]> {
    return this.forDoc(tenantId, t, d);
  }
  async listPendingForRoles(
    tenantId: string,
    roles: readonly string[],
  ): Promise<readonly ApprovalRequest[]> {
    return [...this.rows.values()].filter((r) => {
      const step = r.currentStep();
      return (
        r.snapshot().tenantId === tenantId &&
        r.isPending &&
        step !== null &&
        roles.includes(step.approverRole)
      );
    });
  }
  async create(request: ApprovalRequest): Promise<void> {
    this.rows.set(request.snapshot().id, request);
  }
  async save(request: ApprovalRequest): Promise<void> {
    this.rows.set(request.snapshot().id, request);
  }
}

export class InMemoryDelegationRepository implements DelegationRepository {
  readonly rows = new Map<string, Delegation>();
  async findById(tenantId: string, id: string): Promise<Delegation | null> {
    const d = this.rows.get(id);
    return d && d.snapshot().tenantId === tenantId ? d : null;
  }
  async listActiveTo(
    tenantId: string,
    toUserId: string,
    date: string,
  ): Promise<readonly Delegation[]> {
    return [...this.rows.values()].filter(
      (d) =>
        d.snapshot().tenantId === tenantId &&
        d.snapshot().toUserId === toUserId &&
        d.isActiveOn(date),
    );
  }
  async listFrom(
    tenantId: string,
    fromUserId: string,
  ): Promise<readonly Delegation[]> {
    return [...this.rows.values()].filter(
      (d) =>
        d.snapshot().tenantId === tenantId &&
        d.snapshot().fromUserId === fromUserId,
    );
  }
  async create(delegation: Delegation): Promise<void> {
    this.rows.set(delegation.snapshot().id, delegation);
  }
  async save(delegation: Delegation): Promise<void> {
    this.rows.set(delegation.snapshot().id, delegation);
  }
}

export class StubUserRolesLookup implements UserRolesLookup {
  constructor(
    private readonly byUser: Readonly<Record<string, readonly string[]>>,
  ) {}
  async rolesOf(_t: string, userId: string): Promise<readonly string[]> {
    return this.byUser[userId] ?? [];
  }
  async userExists(_t: string, userId: string): Promise<boolean> {
    return userId in this.byUser;
  }
}

export class InMemoryApprovalOutbox implements ApprovalOutbox {
  readonly envelopes: ApprovalOutboxEnvelope[] = [];
  async enqueue(e: ApprovalOutboxEnvelope): Promise<void> {
    this.envelopes.push(e);
  }
}

export class SwitchableTenantContext implements TenantContext {
  constructor(
    private readonly tenantId: string,
    public userId: string,
  ) {}
  getTenantId(): string {
    return this.tenantId;
  }
  getUserId(): string {
    return this.userId;
  }
  tryGetUserId(): string | null {
    return this.userId;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
}

export class AutocommitTransactionManager implements TransactionManager {
  calls = 0;
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    return work();
  }
}
