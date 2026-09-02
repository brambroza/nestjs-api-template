import {
  AlreadyDecidedError,
  ApprovalNotPendingError,
  ApprovalRequest,
  ApprovalStatus,
  Decision,
  NotAnEligibleApproverError,
  NotTheRequesterError,
  SelfApprovalError,
  StepStatus,
  type Decider,
} from './approval-request';

describe('ApprovalRequest', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const step = (
    id: string,
    name: string,
    approverRole: string,
    requiredApprovals = 1,
  ) => ({
    id,
    requestStepId: `r-${id}`,
    stepNo: 0,
    name,
    approverRole,
    minAmountMinor: null,
    requiredApprovals,
  });
  const make = (
    steps = [
      step('s1', 'Manager', 'sales-manager'),
      step('s2', 'CFO', 'finance-admin'),
    ],
  ) =>
    ApprovalRequest.create({
      id: 'req',
      tenantId: 't',
      documentType: 'SALES_ORDER',
      documentId: 'so-1',
      policyId: 'p',
      amountMinor: 1_000_000n,
      currency: 'thb',
      requestedBy: 'alice',
      steps,
      now,
    });
  const decider = (
    userId: string,
    ownRoles: string[],
    delegated: Record<string, string[]> = {},
  ): Decider => ({
    userId,
    ownRoles,
    delegatedRoles: new Map(Object.entries(delegated)),
  });
  let n = 0;
  const decide = (
    r: ApprovalRequest,
    d: Decider,
    decision: Decision = Decision.Approve,
    comment?: string,
  ) =>
    r.decide({
      decider: d,
      decision,
      comment,
      decisionId: `d${String(++n)}`,
      now,
    });

  it('no applicable steps = approved on creation', () => {
    const r = make([]);
    expect(r.snapshot()).toMatchObject({
      status: ApprovalStatus.Approved,
      currentStepNo: null,
      resolvedAt: now,
    });
  });

  it('walks the steps in order; last approval resolves the request', () => {
    let r = make();
    expect(r.snapshot()).toMatchObject({
      status: 'PENDING',
      currentStepNo: 1,
      currency: 'THB',
    });
    r = decide(r, decider('bob', ['sales-manager']), Decision.Approve, 'ok');
    expect(r.snapshot().currentStepNo).toBe(2);
    expect(r.snapshot().steps[0]).toMatchObject({
      status: StepStatus.Approved,
    });
    expect(r.snapshot().steps[0]?.decisions[0]).toMatchObject({
      decidedBy: 'bob',
      comment: 'ok',
      onBehalfOf: null,
    });
    r = decide(r, decider('carol', ['finance-admin']));
    expect(r.snapshot()).toMatchObject({
      status: ApprovalStatus.Approved,
      currentStepNo: null,
      resolvedAt: now,
    });
  });

  it('a reject at any step ends the request', () => {
    const r = decide(
      make(),
      decider('bob', ['sales-manager']),
      Decision.Reject,
      'too risky',
    );
    expect(r.snapshot()).toMatchObject({
      status: ApprovalStatus.Rejected,
      currentStepNo: null,
    });
    expect(r.snapshot().steps[0]?.status).toBe(StepStatus.Rejected);
    expect(() => decide(r, decider('carol', ['finance-admin']))).toThrow(
      ApprovalNotPendingError,
    );
  });

  it('segregation of duties, role eligibility and one decision per user', () => {
    const r = make();
    expect(() => decide(r, decider('alice', ['sales-manager']))).toThrow(
      SelfApprovalError,
    );
    expect(() => decide(r, decider('dave', ['shopfloor']))).toThrow(
      NotAnEligibleApproverError,
    );
    // step 2's role does not unlock step 1
    expect(() => decide(r, decider('carol', ['finance-admin']))).toThrow(
      NotAnEligibleApproverError,
    );
  });

  it('a step needing 2 approvals waits for a second distinct approver', () => {
    let r = make([step('s1', 'Two managers', 'sales-manager', 2)]);
    r = decide(r, decider('bob', ['sales-manager']));
    expect(r.snapshot().status).toBe('PENDING');
    expect(() => decide(r, decider('bob', ['sales-manager']))).toThrow(
      AlreadyDecidedError,
    );
    r = decide(r, decider('erin', ['sales-manager']));
    expect(r.snapshot().status).toBe(ApprovalStatus.Approved);
  });

  it('delegation: decider inherits the delegator role and the record names both', () => {
    let r = make([step('s1', 'Two managers', 'sales-manager', 2)]);
    const frank = decider('frank', ['shopfloor'], { bob: ['sales-manager'] });
    r = decide(r, frank);
    expect(r.snapshot().status).toBe('PENDING');
    expect(r.snapshot().steps[0]?.decisions[0]).toMatchObject({
      decidedBy: 'frank',
      onBehalfOf: 'bob',
    });
    // bob cannot now decide the same step himself (already counted via frank)
    expect(() => decide(r, decider('bob', ['sales-manager']))).toThrow(
      AlreadyDecidedError,
    );
    // delegated authority from the requester is still self-approval
    const viaAlice = decider('gina', [], { alice: ['sales-manager'] });
    expect(() => decide(make(), viaAlice)).toThrow(SelfApprovalError);
  });

  it('only the requester cancels, and only while pending', () => {
    const r = make();
    expect(() => r.cancel('bob', now)).toThrow(NotTheRequesterError);
    const c = r.cancel('alice', now);
    expect(c.snapshot().status).toBe(ApprovalStatus.Cancelled);
    expect(() => c.cancel('alice', now)).toThrow(ApprovalNotPendingError);
  });
});
