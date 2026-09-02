import type { GoodsReceipt } from '../../domain';

export const GOODS_RECEIPT_REPOSITORY = Symbol('GOODS_RECEIPT_REPOSITORY');

export interface GoodsReceiptRepository {
  findById(tenantId: string, id: string): Promise<GoodsReceipt | null>;
  /** Newest first. */
  listForOrder(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<readonly GoodsReceipt[]>;
  create(grn: GoodsReceipt): Promise<void>;
  save(grn: GoodsReceipt): Promise<GoodsReceipt>;
}
