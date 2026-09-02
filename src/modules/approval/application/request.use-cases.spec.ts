import {
  ApprovalPolicy,
  ApprovalStatus,
  Decision,
  Delegation,
  NotAnEligibleApproverError,
  PendingApprovalExistsError,
} from '../domain';

import { ApprovalGatewayService } from './approval-gateway';
import {
  DecideApprovalUseCase,
  ListMyPendingApprovalsUseCase,
  SubmitForApprovalUseCase,
} from './request.use-cases';
import {
  AutocommitTransactionManager,
  FixedClock,
  InMemoryApprovalOutbox,
  InMemoryDelegationRepository,
  InMemoryPolicyRepository,
  InMemoryRequestRepository,
  StubUserRolesLookup,
  SwitchableTenantContext,
} from './testing/in-memory';

describe('approval request use cases', () => {
  const now = new Date('2026-09-15T03:00:00.000Z');
  const tenantId = 't';
  let policies: InMemoryPolicyRepository;
  let requests: InMemoryRequestRepository;
  let delegations: InMemoryDelegationRepository;
  let outbox: InMemoryApprovalOutbox;
  let ctx: SwitchableTenantContext;
  let submit: SubmitForApprovalUseCase;
  let decide: DecideApprovalUseCase;
  let inbox: ListMyPendingApprovalsUseCase;
  let gateway: ApprovalGatewayService;

  beforeEach(() => {
    policies = new InMemoryPolicyRepository();
    requests = new InMemoryRequestRepository();
    delegations = new InMemoryDelegationRepository();
    outbox = new InMemoryApprovalOutbox();
    ctx = new SwitchableTenantContext(tenantId, 'alice');
    const clock = new FixedClock(now);
    const tx = new AutocommitTransactionManager();
    const roles = new StubUserRolesLookup({
      alice: ['creator'],
      bob: ['sales-manager'],
      carol: ['finance-admin'],
      frank: ['shopfloor'],
    });
    submit = new SubmitForApprovalUseCase(
      requests,
      policies,
      outbox,
      tx,
      ctx,
      clock,
    );
    decide = new DecideApprovalUseCase(
      requests,
      delegations,
      roles,
      outbox,
      tx,
      ctx,
      clock,
    );
    inbox = new ListMyPendingApprovalsUseCase(
      requests,
      delegations,
      roles,
      ctx,
      clock,
    );
    gateway = new ApprovalGatewayService(submit, requests, ctx);

    policies.rows.set(
      'p',
      ApprovalPolicy.create({
        id: 'p',
        tenantId,
        documentType: 'SALES_ORDER',
        name: 'SO',
        steps: [
          { id: 's1', name: 'Manager', approverRole: 'sales-manager' },
          {
            id: 's2',
            name: 'CFO',
            approverRole: 'finance-admin',
            minAmountMinor: 500_000_00n,
          },
        ],
        now,
      }),
    );
  });

  const so = (id: string, amountMinor: bigint) => ({
    documentType: 'sales_order',
    documentId: id,
    amountMinor,
    currency: 'THB',
  });

  it('no policy for the type -> approved immediately, no event', async () => {
    const r = await submit.execute({
      ...so('q-1', 1n),
      documentType: 'QUOTATION',
    });
    expect(r.snapshot()).toMatchObject({
      status: ApprovalStatus.Approved,
      policyId: null,
    });
    expect(outbox.envelopes).toHaveLength(0);
    expect(await gateway.stateOf('quotation', 'q-1')).toMatchObject({
      status: 'APPROVED',
    });
  });

  it('small SO: one step; the gateway reports PENDING then APPROVED; events flow to the outbox', async () => {
    const out = await gateway.submit(so('so-1', 100_000_00n));
    expect(out.status).toBe(ApprovalStatus.Pending);
    expect(outbox.envelopes.map((e) => e.event.type)).toEqual([
      'approval.requested.v1',
    ]);
    await expect(submit.execute(so('so-1', 100_000_00n))).rejects.toThrow(
      PendingApprovalExistsError,
    );

    ctx.userId = 'bob';
    expect((await inbox.execute()).map((r) => r.snapshot().documentId)).toEqual(
      ['so-1'],
    );
    const done = await decide.execute({
      requestId: out.requestId,
      decision: Decision.Approve,
    });
    expect(done.snapshot().status).toBe(ApprovalStatus.Approved);
    expect(outbox.envelopes.map((e) => e.event.type)).toEqual([
      'approval.requested.v1',
      'approval.approved.v1',
    ]);
    expect(await gateway.stateOf('SALES_ORDER', 'so-1')).toMatchObject({
      status: 'APPROVED',
      requestId: out.requestId,
    });
    expect(await inbox.execute()).toHaveLength(0);
  });

  it('large SO: two steps, step-advanced event, CFO decides via delegation', async () => {
    const out = await gateway.submit(so('so-2', 900_000_00n));
    ctx.userId = 'bob';
    await decide.execute({
      requestId: out.requestId,
      decision: Decision.Approve,
    });
    expect(outbox.envelopes.map((e) => e.event.type)).toEqual([
      'approval.requested.v1',
      'approval.step_advanced.v1',
    ]);

    // frank has no finance role until carol delegates to him for today
    ctx.userId = 'frank';
    await expect(
      decide.execute({ requestId: out.requestId, decision: Decision.Approve }),
    ).rejects.toThrow(NotAnEligibleApproverError);
    delegations.rows.set(
      'd',
      Delegation.create({
        id: 'd',
        tenantId,
        fromUserId: 'carol',
        toUserId: 'frank',
        fromDate: '2026-09-10',
        toDate: '2026-09-20',
        now,
      }),
    );
    expect((await inbox.execute()).map((r) => r.snapshot().documentId)).toEqual(
      ['so-2'],
    );
    const done = await decide.execute({
      requestId: out.requestId,
      decision: Decision.Approve,
      comment: 'covering for carol',
    });
    expect(done.snapshot().status).toBe(ApprovalStatus.Approved);
    expect(done.snapshot().steps[1]?.decisions[0]).toMatchObject({
      decidedBy: 'frank',
      onBehalfOf: 'carol',
    });
  });

  it('a reject resolves with a rejected event and the gateway says so', async () => {
    const out = await gateway.submit(so('so-3', 1_00n));
    ctx.userId = 'bob';
    await decide.execute({
      requestId: out.requestId,
      decision: Decision.Reject,
      comment: 'no credit',
    });
    expect(outbox.envelopes.at(-1)?.event.type).toBe('approval.rejected.v1');
    expect((await gateway.stateOf('SALES_ORDER', 'so-3')).status).toBe(
      'REJECTED',
    );
    // a new request may now be opened for the same document
    ctx.userId = 'alice';
    await expect(submit.execute(so('so-3', 1_00n))).resolves.toBeDefined();
  });
});
