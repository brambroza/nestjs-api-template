import { DomainError } from '../../../shared/errors';

export const DOCUMENT_TYPE_RE = /^[A-Z][A-Z0-9_]{2,31}$/;

export class ApprovalPolicyNotFoundError extends DomainError {
  readonly code = 'APPROVAL.POLICY_NOT_FOUND';
  constructor(readonly ref: string) {
    super(`Approval policy ${ref} not found`);
  }
}
export class ActiveApprovalPolicyExistsError extends DomainError {
  readonly code = 'APPROVAL.ACTIVE_POLICY_EXISTS';
  constructor(
    readonly documentType: string,
    readonly existingPolicyId: string,
  ) {
    super(
      `${documentType} already has an active approval policy (${existingPolicyId})`,
    );
  }
}
export class InvalidApprovalPolicyError extends DomainError {
  readonly code = 'APPROVAL.INVALID_POLICY';
}

export interface ApprovalPolicyStepSnapshot {
  readonly id: string;
  readonly stepNo: number;
  readonly name: string;
  readonly approverRole: string;
  /** Step applies only when the document amount >= this. null = always. */
  readonly minAmountMinor: bigint | null;
  readonly requiredApprovals: number;
}

export interface ApprovalPolicySnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly documentType: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly steps: readonly ApprovalPolicyStepSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePolicyStepInput {
  readonly id: string;
  readonly name: string;
  readonly approverRole: string;
  readonly minAmountMinor?: bigint | null;
  readonly requiredApprovals?: number;
}

export interface CreateApprovalPolicyProps {
  readonly id: string;
  readonly tenantId: string;
  readonly documentType: string;
  readonly name: string;
  readonly steps: readonly CreatePolicyStepInput[];
  readonly now: Date;
}

/**
 * The "approval matrix" for one document type: ordered steps, each
 * gated by an amount tier. Steps are numbered in the order given; a
 * later step must not have a LOWER tier than an earlier one, so the
 * chain reads "up to X: step 1; from X: step 1 then step 2".
 */
export class ApprovalPolicy {
  private constructor(private readonly s: ApprovalPolicySnapshot) {}

  static create(props: CreateApprovalPolicyProps): ApprovalPolicy {
    const documentType = props.documentType.trim().toUpperCase();
    if (!DOCUMENT_TYPE_RE.test(documentType)) {
      throw new InvalidApprovalPolicyError(
        'documentType must be 3-32 chars of A-Z, 0-9, underscore, starting with a letter',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new InvalidApprovalPolicyError('name must be 1-100 characters');
    }
    if (props.steps.length === 0) {
      throw new InvalidApprovalPolicyError('a policy needs at least one step');
    }
    let previousTier = -1n;
    const steps = props.steps.map((st, i) => {
      const stepName = st.name.trim();
      if (stepName.length === 0 || stepName.length > 100) {
        throw new InvalidApprovalPolicyError(
          `step ${String(i + 1)}: name must be 1-100 characters`,
        );
      }
      const role = st.approverRole.trim();
      if (role.length === 0 || role.length > 64) {
        throw new InvalidApprovalPolicyError(
          `step ${String(i + 1)}: approverRole is required`,
        );
      }
      const min = st.minAmountMinor ?? null;
      if (min !== null && min < 0n) {
        throw new InvalidApprovalPolicyError(
          `step ${String(i + 1)}: minAmountMinor must not be negative`,
        );
      }
      const tier = min ?? 0n;
      if (tier < previousTier) {
        throw new InvalidApprovalPolicyError(
          `step ${String(i + 1)}: amount tier must not be lower than the previous step's`,
        );
      }
      previousTier = tier;
      const required = st.requiredApprovals ?? 1;
      if (!Number.isInteger(required) || required < 1 || required > 10) {
        throw new InvalidApprovalPolicyError(
          `step ${String(i + 1)}: requiredApprovals must be 1-10`,
        );
      }
      return {
        id: st.id,
        stepNo: i + 1,
        name: stepName,
        approverRole: role,
        minAmountMinor: min,
        requiredApprovals: required,
      };
    });
    return new ApprovalPolicy({
      id: props.id,
      tenantId: props.tenantId,
      documentType,
      name,
      isActive: true,
      steps,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ApprovalPolicySnapshot): ApprovalPolicy {
    return new ApprovalPolicy(s);
  }

  /** Steps that apply to a document of this amount, in order. */
  applicableSteps(amountMinor: bigint): readonly ApprovalPolicyStepSnapshot[] {
    return this.s.steps.filter(
      (st) => st.minAmountMinor === null || amountMinor >= st.minAmountMinor,
    );
  }

  deactivate(now: Date): ApprovalPolicy {
    if (!this.s.isActive) return this;
    return new ApprovalPolicy({ ...this.s, isActive: false, updatedAt: now });
  }

  snapshot(): ApprovalPolicySnapshot {
    return this.s;
  }
}
