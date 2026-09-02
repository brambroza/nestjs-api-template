import type { Clock } from '../../../../../shared/clock';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import {
  type AddressType,
  type ConsentRecord,
  type Contact,
  type PartnerAddress,
  type PartnerRef,
  type PdpaRequest,
  PdpaRequestStatus,
  type PdpaRequestType,
} from '../../domain';
import type { AddressRepository } from '../ports/address.repository';
import type { ConsentRepository } from '../ports/consent.repository';
import type { ContactRepository } from '../ports/contact.repository';
import type {
  PartnerLookup,
  PartnerLookupResult,
} from '../ports/partner-lookup.port';
import type { PdpaRequestRepository } from '../ports/pdpa-request.repository';

const sameRef = (a: PartnerRef, b: PartnerRef): boolean =>
  a.type === b.type && a.id === b.id;

export class InMemoryPartnerLookup implements PartnerLookup {
  private readonly rows = new Map<string, PartnerLookupResult>();

  put(tenantId: string, ref: PartnerRef, result: PartnerLookupResult): void {
    this.rows.set(`${tenantId}|${ref.type}|${ref.id}`, result);
  }

  async find(
    tenantId: string,
    ref: PartnerRef,
  ): Promise<PartnerLookupResult | null> {
    return this.rows.get(`${tenantId}|${ref.type}|${ref.id}`) ?? null;
  }
}

export class InMemoryContactRepository implements ContactRepository {
  readonly rows = new Map<string, Contact>();

  async findById(tenantId: string, id: string): Promise<Contact | null> {
    const c = this.rows.get(id);
    return c && c.snapshot().tenantId === tenantId ? c : null;
  }

  async findPrimary(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<Contact | null> {
    for (const c of this.rows.values()) {
      const s = c.snapshot();
      if (
        s.tenantId === tenantId &&
        sameRef(s.partner, partner) &&
        s.isPrimary
      ) {
        return c;
      }
    }
    return null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Contact[]> {
    return [...this.rows.values()].filter((c) => {
      const s = c.snapshot();
      return (
        s.tenantId === tenantId &&
        sameRef(s.partner, partner) &&
        (!opts.activeOnly || s.isActive)
      );
    });
  }

  async create(contact: Contact): Promise<void> {
    this.rows.set(contact.snapshot().id, contact);
  }

  async save(contact: Contact): Promise<void> {
    this.rows.set(contact.snapshot().id, contact);
  }
}

export class InMemoryAddressRepository implements AddressRepository {
  readonly rows = new Map<string, PartnerAddress>();

  async findById(tenantId: string, id: string): Promise<PartnerAddress | null> {
    const a = this.rows.get(id);
    return a && a.snapshot().tenantId === tenantId ? a : null;
  }

  async findDefault(
    tenantId: string,
    partner: PartnerRef,
    addressType: AddressType,
  ): Promise<PartnerAddress | null> {
    for (const a of this.rows.values()) {
      const s = a.snapshot();
      if (
        s.tenantId === tenantId &&
        sameRef(s.partner, partner) &&
        s.addressType === addressType &&
        s.isDefault
      ) {
        return a;
      }
    }
    return null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly PartnerAddress[]> {
    return [...this.rows.values()].filter((a) => {
      const s = a.snapshot();
      return (
        s.tenantId === tenantId &&
        sameRef(s.partner, partner) &&
        (!opts.activeOnly || s.isActive)
      );
    });
  }

  async create(address: PartnerAddress): Promise<void> {
    this.rows.set(address.snapshot().id, address);
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  readonly rows: ConsentRecord[] = [];

  async append(record: ConsentRecord): Promise<void> {
    this.rows.push(record);
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly ConsentRecord[]> {
    return this.rows
      .filter((r) => {
        const s = r.snapshot();
        return s.tenantId === tenantId && sameRef(s.partner, partner);
      })
      .sort(
        (a, b) =>
          a.snapshot().recordedAt.getTime() - b.snapshot().recordedAt.getTime(),
      );
  }
}

export class InMemoryPdpaRequestRepository implements PdpaRequestRepository {
  readonly rows = new Map<string, PdpaRequest>();

  async findById(tenantId: string, id: string): Promise<PdpaRequest | null> {
    const r = this.rows.get(id);
    return r && r.snapshot().tenantId === tenantId ? r : null;
  }

  async findPending(
    tenantId: string,
    partner: PartnerRef,
    requestType: PdpaRequestType,
  ): Promise<PdpaRequest | null> {
    for (const r of this.rows.values()) {
      const s = r.snapshot();
      if (
        s.tenantId === tenantId &&
        sameRef(s.partner, partner) &&
        s.requestType === requestType &&
        s.status === PdpaRequestStatus.Pending
      ) {
        return r;
      }
    }
    return null;
  }

  async listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly PdpaRequest[]> {
    return [...this.rows.values()]
      .filter((r) => {
        const s = r.snapshot();
        return s.tenantId === tenantId && sameRef(s.partner, partner);
      })
      .sort(
        (a, b) =>
          b.snapshot().requestedAt.getTime() -
          a.snapshot().requestedAt.getTime(),
      );
  }

  async create(request: PdpaRequest): Promise<void> {
    this.rows.set(request.snapshot().id, request);
  }

  async save(request: PdpaRequest): Promise<void> {
    this.rows.set(request.snapshot().id, request);
  }
}

export class FixedTenantContext implements TenantContext {
  constructor(
    private readonly tenantId: string,
    private readonly userId: string,
  ) {}
  getTenantId(): string {
    return this.tenantId;
  }
  getUserId(): string {
    return this.userId;
  }
  tryGetUserId(): string | null {
    return this.userId;
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  set(d: Date): void {
    this.current = d;
  }
}

/** Runs work directly. Tx boundaries are not exercised by these unit tests. */
export class AutocommitTransactionManager implements TransactionManager {
  calls = 0;
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    return work();
  }
}
