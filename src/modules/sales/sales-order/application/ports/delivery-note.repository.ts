import type { DeliveryNote } from '../../domain';

export const DELIVERY_NOTE_REPOSITORY = Symbol('DELIVERY_NOTE_REPOSITORY');

export interface DeliveryNoteRepository {
  findById(tenantId: string, id: string): Promise<DeliveryNote | null>;
  /** Newest first. */
  listForOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<readonly DeliveryNote[]>;
  create(note: DeliveryNote): Promise<void>;
  save(note: DeliveryNote): Promise<DeliveryNote>;
}
