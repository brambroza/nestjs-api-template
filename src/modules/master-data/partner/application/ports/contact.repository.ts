import type { Contact, PartnerRef } from '../../domain';

export const CONTACT_REPOSITORY = Symbol('CONTACT_REPOSITORY');

export interface ContactRepository {
  findById(tenantId: string, id: string): Promise<Contact | null>;
  findPrimary(tenantId: string, partner: PartnerRef): Promise<Contact | null>;
  listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Contact[]>;
  create(contact: Contact): Promise<void>;
  /** Full-row update; used by erasure. */
  save(contact: Contact): Promise<void>;
}
