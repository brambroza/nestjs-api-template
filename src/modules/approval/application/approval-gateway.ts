import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import type { ApprovalStatus } from '../domain';

import {
  APPROVAL_REQUEST_REPOSITORY,
  type ApprovalRequestRepository,
} from './ports/approval-request.repository';
import { SubmitForApprovalUseCase } from './request.use-cases';

export const APPROVAL_GATEWAY = Symbol('APPROVAL_GATEWAY');

export interface ApprovalSubmitInput {
  readonly documentType: string;
  readonly documentId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
}

export interface ApprovalOutcome {
  readonly requestId: string;
  readonly status: ApprovalStatus;
}

export interface ApprovalStateView {
  readonly status: ApprovalStatus | 'NONE';
  readonly requestId: string | null;
}

/**
 * The ONLY surface other modules see (re-exported from the module
 * root). Documents call `submit` inside their own transaction and read
 * `stateOf` before a transition that requires approval.
 */
export interface ApprovalGateway {
  submit(input: ApprovalSubmitInput): Promise<ApprovalOutcome>;
  stateOf(documentType: string, documentId: string): Promise<ApprovalStateView>;
}

@Injectable()
export class ApprovalGatewayService implements ApprovalGateway {
  constructor(
    private readonly submitUseCase: SubmitForApprovalUseCase,
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly requests: ApprovalRequestRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async submit(input: ApprovalSubmitInput): Promise<ApprovalOutcome> {
    const r = await this.submitUseCase.execute(input);
    return { requestId: r.snapshot().id, status: r.snapshot().status };
  }

  async stateOf(
    documentType: string,
    documentId: string,
  ): Promise<ApprovalStateView> {
    const latest = (
      await this.requests.listForDocument(
        this.tenant.getTenantId(),
        documentType.toUpperCase(),
        documentId,
      )
    )[0];
    return latest
      ? { status: latest.snapshot().status, requestId: latest.snapshot().id }
      : { status: 'NONE', requestId: null };
  }
}
