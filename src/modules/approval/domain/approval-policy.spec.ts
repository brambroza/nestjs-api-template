import { ApprovalPolicy, InvalidApprovalPolicyError } from './approval-policy';

describe('ApprovalPolicy', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const base = {
    id: 'p',
    tenantId: 't',
    documentType: 'sales_order',
    name: 'SO matrix',
    now,
  };

  it('numbers steps and filters by amount tier', () => {
    const p = ApprovalPolicy.create({
      ...base,
      steps: [
        { id: 's1', name: 'Sales manager', approverRole: 'sales-manager' },
        {
          id: 's2',
          name: 'CFO',
          approverRole: 'finance-admin',
          minAmountMinor: 500_000_00n,
        },
        {
          id: 's3',
          name: 'CEO',
          approverRole: 'admin',
          minAmountMinor: 5_000_000_00n,
          requiredApprovals: 1,
        },
      ],
    });
    expect(p.snapshot().documentType).toBe('SALES_ORDER');
    expect(p.snapshot().steps.map((s) => s.stepNo)).toEqual([1, 2, 3]);
    expect(p.applicableSteps(10_000_00n).map((s) => s.name)).toEqual([
      'Sales manager',
    ]);
    expect(p.applicableSteps(500_000_00n).map((s) => s.name)).toEqual([
      'Sales manager',
      'CFO',
    ]);
    expect(p.applicableSteps(9_000_000_00n)).toHaveLength(3);
  });

  it('rejects a descending tier, empty steps and a bad document type', () => {
    expect(() =>
      ApprovalPolicy.create({
        ...base,
        steps: [
          { id: 's1', name: 'A', approverRole: 'r', minAmountMinor: 100n },
          { id: 's2', name: 'B', approverRole: 'r', minAmountMinor: 50n },
        ],
      }),
    ).toThrow(InvalidApprovalPolicyError);
    expect(() => ApprovalPolicy.create({ ...base, steps: [] })).toThrow(
      InvalidApprovalPolicyError,
    );
    expect(() =>
      ApprovalPolicy.create({
        ...base,
        documentType: 'so',
        steps: [{ id: 's', name: 'A', approverRole: 'r' }],
      }),
    ).toThrow(InvalidApprovalPolicyError);
  });
});
