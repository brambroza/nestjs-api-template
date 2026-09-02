/**
 * Public surface of the approval module. Sales / purchase modules import
 * from HERE (`../approval`) and nowhere deeper — dependency-cruiser
 * forbids reaching into approval/domain|application|infrastructure.
 */
export { ApprovalModule } from './approval.module';
export {
  APPROVAL_GATEWAY,
  type ApprovalGateway,
  type ApprovalOutcome,
  type ApprovalStateView,
  type ApprovalSubmitInput,
} from './application/approval-gateway';
export { ApprovalStatus } from './domain/approval-request';
