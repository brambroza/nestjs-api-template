import { Module } from '@nestjs/common';

import { ApprovalPolicyController } from './api/approval-policy.controller';
import { ApprovalRequestController } from './api/approval-request.controller';
import { DelegationController } from './api/delegation.controller';
import {
  APPROVAL_GATEWAY,
  ApprovalGatewayService,
  CancelApprovalUseCase,
  CreateApprovalPolicyUseCase,
  CreateDelegationUseCase,
  DeactivateApprovalPolicyUseCase,
  DecideApprovalUseCase,
  GetApprovalPolicyUseCase,
  GetApprovalRequestUseCase,
  ListApprovalPoliciesUseCase,
  ListDocumentApprovalsUseCase,
  ListMyDelegationsUseCase,
  ListMyPendingApprovalsUseCase,
  RevokeDelegationUseCase,
  SubmitForApprovalUseCase,
} from './application';
import { APPROVAL_POLICY_REPOSITORY } from './application/ports/approval-policy.repository';
import { APPROVAL_REQUEST_REPOSITORY } from './application/ports/approval-request.repository';
import { DELEGATION_REPOSITORY } from './application/ports/delegation.repository';
import { APPROVAL_OUTBOX } from './application/ports/outbox.port';
import { USER_ROLES_LOOKUP } from './application/ports/user-roles-lookup.port';
import { PrismaApprovalOutbox } from './infrastructure/prisma-approval-outbox';
import { PrismaApprovalPolicyRepository } from './infrastructure/prisma-approval-policy.repository';
import { PrismaApprovalRequestRepository } from './infrastructure/prisma-approval-request.repository';
import { PrismaDelegationRepository } from './infrastructure/prisma-delegation.repository';
import { PrismaUserRolesLookup } from './infrastructure/prisma-user-roles-lookup';

/**
 * EPIC-B.4. Other modules depend ONLY on APPROVAL_GATEWAY, imported from
 * this module's root index — never on application/ or domain/ here.
 */
@Module({
  controllers: [
    ApprovalPolicyController,
    ApprovalRequestController,
    DelegationController,
  ],
  providers: [
    {
      provide: APPROVAL_POLICY_REPOSITORY,
      useClass: PrismaApprovalPolicyRepository,
    },
    {
      provide: APPROVAL_REQUEST_REPOSITORY,
      useClass: PrismaApprovalRequestRepository,
    },
    { provide: DELEGATION_REPOSITORY, useClass: PrismaDelegationRepository },
    { provide: USER_ROLES_LOOKUP, useClass: PrismaUserRolesLookup },
    { provide: APPROVAL_OUTBOX, useClass: PrismaApprovalOutbox },
    { provide: APPROVAL_GATEWAY, useClass: ApprovalGatewayService },
    CreateApprovalPolicyUseCase,
    ListApprovalPoliciesUseCase,
    GetApprovalPolicyUseCase,
    DeactivateApprovalPolicyUseCase,
    SubmitForApprovalUseCase,
    DecideApprovalUseCase,
    CancelApprovalUseCase,
    GetApprovalRequestUseCase,
    ListDocumentApprovalsUseCase,
    ListMyPendingApprovalsUseCase,
    CreateDelegationUseCase,
    ListMyDelegationsUseCase,
    RevokeDelegationUseCase,
  ],
  exports: [APPROVAL_GATEWAY],
})
export class ApprovalModule {}
