import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  Decision,
  type ApprovalPolicy,
  type ApprovalRequest,
  type Delegation,
} from '../../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOC_TYPE = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;

// ---- policies -------------------------------------------------------------

export class PolicyStepRequestDto {
  @Expose() @IsString() @Length(1, 100) name!: string;
  @Expose() @IsString() @Length(1, 64) approverRole!: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) minAmountMinor?: string;
  @Expose() @IsOptional() @IsInt() @Min(1) @Max(10) requiredApprovals?: number;
}

export class CreatePolicyRequestDto {
  @Expose() @IsString() @Matches(DOC_TYPE) documentType!: string;
  @Expose() @IsString() @Length(1, 100) name!: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolicyStepRequestDto)
  steps!: PolicyStepRequestDto[];
  @Expose() @IsOptional() @IsBoolean() replaceActive?: boolean;
}

export class ListPoliciesQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class PolicyStepResponseDto {
  @Expose() id!: string;
  @Expose() stepNo!: number;
  @Expose() name!: string;
  @Expose() approverRole!: string;
  @Expose() minAmountMinor!: string | null;
  @Expose() requiredApprovals!: number;
}

export class PolicyResponseDto {
  @Expose() id!: string;
  @Expose() documentType!: string;
  @Expose() name!: string;
  @Expose() isActive!: boolean;
  @Expose() @Type(() => PolicyStepResponseDto) steps!: PolicyStepResponseDto[];
  @Expose() createdAt!: string;
}

export class PolicyListResponseDto {
  @Expose() @Type(() => PolicyResponseDto) items!: PolicyResponseDto[];
}

export function toPolicyDto(p: ApprovalPolicy): PolicyResponseDto {
  const s = p.snapshot();
  const dto = new PolicyResponseDto();
  dto.id = s.id;
  dto.documentType = s.documentType;
  dto.name = s.name;
  dto.isActive = s.isActive;
  dto.steps = s.steps.map((st) => {
    const d = new PolicyStepResponseDto();
    d.id = st.id;
    d.stepNo = st.stepNo;
    d.name = st.name;
    d.approverRole = st.approverRole;
    d.minAmountMinor = st.minAmountMinor?.toString() ?? null;
    d.requiredApprovals = st.requiredApprovals;
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  return dto;
}

// ---- requests -------------------------------------------------------------

export class SubmitApprovalRequestDto {
  @Expose() @IsString() @Matches(DOC_TYPE) documentType!: string;
  @Expose() @IsString() @Length(1, 36) documentId!: string;
  @Expose() @IsString() @Matches(INT) amountMinor!: string;
  @Expose() @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
}

export class DecideRequestDto {
  @Expose() @IsString() @IsIn(Object.values(Decision)) decision!: Decision;
  @Expose() @IsOptional() @IsString() @Length(1, 500) comment?: string;
}

export class DocumentApprovalsQueryDto {
  @Expose() @IsString() @Matches(DOC_TYPE) documentType!: string;
  @Expose() @IsString() @Length(1, 36) documentId!: string;
}

export class DecisionResponseDto {
  @Expose() id!: string;
  @Expose() decidedBy!: string;
  @Expose() onBehalfOf!: string | null;
  @Expose() decision!: string;
  @Expose() comment!: string | null;
  @Expose() decidedAt!: string;
}

export class RequestStepResponseDto {
  @Expose() id!: string;
  @Expose() stepNo!: number;
  @Expose() name!: string;
  @Expose() approverRole!: string;
  @Expose() requiredApprovals!: number;
  @Expose() status!: string;
  @Expose() @Type(() => DecisionResponseDto) decisions!: DecisionResponseDto[];
}

export class ApprovalRequestResponseDto {
  @Expose() id!: string;
  @Expose() documentType!: string;
  @Expose() documentId!: string;
  @Expose() policyId!: string | null;
  @Expose() amountMinor!: string;
  @Expose() currency!: string;
  @Expose() requestedBy!: string;
  @Expose() status!: string;
  @Expose() currentStepNo!: number | null;
  @Expose()
  @Type(() => RequestStepResponseDto)
  steps!: RequestStepResponseDto[];
  @Expose() createdAt!: string;
  @Expose() resolvedAt!: string | null;
}

export class ApprovalRequestListResponseDto {
  @Expose()
  @Type(() => ApprovalRequestResponseDto)
  items!: ApprovalRequestResponseDto[];
}

export function toRequestDto(r: ApprovalRequest): ApprovalRequestResponseDto {
  const s = r.snapshot();
  const dto = new ApprovalRequestResponseDto();
  dto.id = s.id;
  dto.documentType = s.documentType;
  dto.documentId = s.documentId;
  dto.policyId = s.policyId;
  dto.amountMinor = s.amountMinor.toString();
  dto.currency = s.currency;
  dto.requestedBy = s.requestedBy;
  dto.status = s.status;
  dto.currentStepNo = s.currentStepNo;
  dto.steps = s.steps.map((st) => {
    const d = new RequestStepResponseDto();
    d.id = st.id;
    d.stepNo = st.stepNo;
    d.name = st.name;
    d.approverRole = st.approverRole;
    d.requiredApprovals = st.requiredApprovals;
    d.status = st.status;
    d.decisions = st.decisions.map((x) => {
      const dd = new DecisionResponseDto();
      dd.id = x.id;
      dd.decidedBy = x.decidedBy;
      dd.onBehalfOf = x.onBehalfOf;
      dd.decision = x.decision;
      dd.comment = x.comment;
      dd.decidedAt = x.decidedAt.toISOString();
      return dd;
    });
    return d;
  });
  dto.createdAt = s.createdAt.toISOString();
  dto.resolvedAt = s.resolvedAt?.toISOString() ?? null;
  return dto;
}

// ---- delegations ----------------------------------------------------------

export class CreateDelegationRequestDto {
  @Expose() @IsString() @Length(1, 64) toUserId!: string;
  @Expose() @IsString() @Matches(ISO_DATE) fromDate!: string;
  @Expose() @IsString() @Matches(ISO_DATE) toDate!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) reason?: string;
}

export class DelegationResponseDto {
  @Expose() id!: string;
  @Expose() fromUserId!: string;
  @Expose() toUserId!: string;
  @Expose() fromDate!: string;
  @Expose() toDate!: string;
  @Expose() reason!: string | null;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
}

export class DelegationListResponseDto {
  @Expose() @Type(() => DelegationResponseDto) items!: DelegationResponseDto[];
}

export function toDelegationDto(d: Delegation): DelegationResponseDto {
  const s = d.snapshot();
  const dto = new DelegationResponseDto();
  dto.id = s.id;
  dto.fromUserId = s.fromUserId;
  dto.toUserId = s.toUserId;
  dto.fromDate = s.fromDate;
  dto.toDate = s.toDate;
  dto.reason = s.reason;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  return dto;
}
