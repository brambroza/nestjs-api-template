import { createMongoAbility, InferSubjects, MongoAbility } from '@casl/ability';

export const Action = {
  Manage: 'manage',
  Create: 'create',
  Read: 'read',
  Update: 'update',
  Delete: 'delete',
  Submit: 'submit',
  Approve: 'approve',
  Release: 'release',
  ReportProgress: 'reportProgress',
  Cancel: 'cancel',
} as const;
export type Action = (typeof Action)[keyof typeof Action];

/**
 * Subjects are string names — CASL matches against these. Real projects
 * usually pair a name with the shape (e.g. `ProductionOrder` class) so
 * conditions like `{ createdBy: user.id }` can be evaluated on
 * candidate entities. The template ships with the name-only form.
 */
export type Subject =
  | 'ProductionOrder'
  | 'ProductionOrderSubmit'
  | 'ProductionOrderApprove'
  | 'ProductionOrderRelease'
  | 'ProductionOrderReport'
  | 'ProductionOrderCancel'
  | 'Customer'
  | 'Vendor'
  | 'Item'
  | 'Uom'
  | 'Company'
  | 'Branch'
  | 'Warehouse'
  | 'PartnerContact'
  | 'PartnerAddress'
  | 'PdpaConsent'
  | 'PdpaRequest'
  | 'ItemCategory'
  | 'PriceList'
  | 'Bom'
  | 'Currency'
  | 'FxRate'
  | 'TaxCode'
  | 'Account'
  | 'FiscalYear'
  | 'ApprovalPolicy'
  | 'ApprovalRequest'
  | 'ApprovalDelegation'
  | 'Quotation'
  | 'SalesOrder'
  | 'DeliveryNote'
  | 'PurchaseRequisition'
  | 'PurchaseOrder'
  | 'GoodsReceipt'
  | 'all';

export type AppSubjects = InferSubjects<Subject>;

export type AppAbility = MongoAbility<[Action, AppSubjects]>;

export function createAppAbility(): AppAbility {
  return createMongoAbility<[Action, AppSubjects]>();
}
