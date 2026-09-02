import {
  ConsentAction,
  ConsentPurpose,
  ConsentRecord,
  ConsentSource,
  Contact,
  ERASED_PLACEHOLDER,
  IllegalPdpaRequestTransitionError,
  PartnerType,
  PdpaRequest,
  PdpaRequestNotFoundError,
  PdpaRequestStatus,
  PdpaRequestType,
} from '../domain';

import { FulfilPdpaRequestUseCase } from './fulfil-pdpa-request.use-case';
import {
  AutocommitTransactionManager,
  FixedClock,
  FixedTenantContext,
  InMemoryAddressRepository,
  InMemoryConsentRepository,
  InMemoryContactRepository,
  InMemoryPartnerLookup,
  InMemoryPdpaRequestRepository,
} from './testing/in-memory';

describe('FulfilPdpaRequestUseCase', () => {
  const tenantId = 't-1';
  const partner = { type: PartnerType.Customer, id: 'cust-1' };
  const other = { type: PartnerType.Customer, id: 'cust-2' };
  const t0 = new Date('2026-09-01T00:00:00.000Z');
  const t1 = new Date('2026-09-10T00:00:00.000Z');

  let contacts: InMemoryContactRepository;
  let requests: InMemoryPdpaRequestRepository;
  let consents: InMemoryConsentRepository;
  let tx: AutocommitTransactionManager;
  let clock: FixedClock;
  let sut: FulfilPdpaRequestUseCase;

  beforeEach(() => {
    const partners = new InMemoryPartnerLookup();
    partners.put(tenantId, partner, {
      isActive: true,
      code: 'CUST-001',
      name: 'Demo Customer',
      taxId: '0105551234567',
    });
    partners.put(tenantId, other, {
      isActive: true,
      code: 'CUST-002',
      name: 'Other',
      taxId: null,
    });
    contacts = new InMemoryContactRepository();
    requests = new InMemoryPdpaRequestRepository();
    consents = new InMemoryConsentRepository();
    tx = new AutocommitTransactionManager();
    clock = new FixedClock(t1);
    sut = new FulfilPdpaRequestUseCase(
      requests,
      contacts,
      new InMemoryAddressRepository(),
      consents,
      partners,
      tx,
      new FixedTenantContext(tenantId, 'dpo-1'),
      clock,
    );
  });

  const seedContact = (id: string, ref = partner, erased = false): void => {
    let c = Contact.create({
      id,
      tenantId,
      partner: ref,
      fullName: `Person ${id}`,
      email: `${id}@example.com`,
      phone: '0812345678',
      now: t0,
    });
    if (erased) c = c.erase(t0);
    contacts.rows.set(id, c);
  };

  const seedRequest = (
    id: string,
    type: PdpaRequestType,
    ref = partner,
  ): PdpaRequest => {
    const r = PdpaRequest.create({
      id,
      tenantId,
      partner: ref,
      requestType: type,
      requestedBy: 'u-1',
      requestedAt: t0,
    });
    requests.rows.set(id, r);
    return r;
  };

  it('ERASURE anonymises every non-erased contact of the partner, in a tx', async () => {
    seedContact('c1');
    seedContact('c2');
    seedContact('c3', partner, true); // already erased at t0
    seedContact('c9', other); // different partner — must be untouched
    seedRequest('req-1', PdpaRequestType.Erasure);

    const result = await sut.execute({
      partner,
      requestId: 'req-1',
      note: 'via email',
    });

    expect(tx.calls).toBe(1);
    expect(result.export).toBeNull();
    const done = result.request.snapshot();
    expect(done.status).toBe(PdpaRequestStatus.Completed);
    expect(done.completedBy).toBe('dpo-1');
    expect(done.completedAt).toEqual(t1);
    expect(done.resultNote).toBe('erased 2 contact(s); via email');

    for (const id of ['c1', 'c2']) {
      const s = contacts.rows.get(id)?.snapshot();
      expect(s?.fullName).toBe(ERASED_PLACEHOLDER);
      expect(s?.email).toBeNull();
      expect(s?.erasedAt).toEqual(t1);
    }
    expect(contacts.rows.get('c3')?.snapshot().erasedAt).toEqual(t0); // not re-stamped
    expect(contacts.rows.get('c9')?.snapshot().fullName).toBe('Person c9');
    expect(requests.rows.get('req-1')?.snapshot().status).toBe(
      PdpaRequestStatus.Completed,
    );
  });

  it('EXPORT returns the full bundle and completes the request', async () => {
    seedContact('c1');
    consents.rows.push(
      ConsentRecord.create({
        id: 'k1',
        tenantId,
        partner,
        purpose: ConsentPurpose.Marketing,
        action: ConsentAction.Grant,
        source: ConsentSource.WebForm,
        recordedBy: 'u-1',
        recordedAt: t0,
      }),
    );
    seedRequest('req-2', PdpaRequestType.Export);

    const result = await sut.execute({ partner, requestId: 'req-2' });

    expect(result.request.snapshot().status).toBe(PdpaRequestStatus.Completed);
    const bundle = result.export;
    expect(bundle).not.toBeNull();
    expect(bundle?.partner).toMatchObject({
      type: PartnerType.Customer,
      id: 'cust-1',
      code: 'CUST-001',
      taxId: '0105551234567',
    });
    expect(bundle?.generatedAt).toEqual(t1);
    expect(bundle?.contacts.map((c) => c.id)).toEqual(['c1']);
    expect(bundle?.consentHistory).toHaveLength(1);
    expect(
      bundle?.consentState.find((s) => s.purpose === ConsentPurpose.Marketing)
        ?.granted,
    ).toBe(true);
    // the bundle reflects the request's post-completion state
    expect(bundle?.requests.find((r) => r.id === 'req-2')?.status).toBe(
      PdpaRequestStatus.Completed,
    );
    // export does NOT erase
    expect(contacts.rows.get('c1')?.snapshot().fullName).toBe('Person c1');
  });

  it('a request belonging to another partner reads as not found', async () => {
    seedRequest('req-3', PdpaRequestType.Erasure, other);
    await expect(sut.execute({ partner, requestId: 'req-3' })).rejects.toThrow(
      PdpaRequestNotFoundError,
    );
  });

  it('a completed request cannot be fulfilled twice', async () => {
    seedContact('c1');
    seedRequest('req-4', PdpaRequestType.Erasure);
    await sut.execute({ partner, requestId: 'req-4' });
    await expect(sut.execute({ partner, requestId: 'req-4' })).rejects.toThrow(
      IllegalPdpaRequestTransitionError,
    );
  });
});
