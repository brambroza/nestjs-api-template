import {
  PartnerNotFoundError,
  PartnerType,
  PdpaRequestAlreadyOpenError,
  PdpaRequestStatus,
  PdpaRequestType,
} from '../domain';

import { CreatePdpaRequestUseCase } from './create-pdpa-request.use-case';
import {
  FixedClock,
  FixedTenantContext,
  InMemoryPartnerLookup,
  InMemoryPdpaRequestRepository,
} from './testing/in-memory';

describe('CreatePdpaRequestUseCase', () => {
  const tenantId = 't-1';
  const partner = { type: PartnerType.Vendor, id: 'vend-1' };
  const inactive = { type: PartnerType.Vendor, id: 'vend-off' };
  const t0 = new Date('2026-09-01T00:00:00.000Z');

  let requests: InMemoryPdpaRequestRepository;
  let sut: CreatePdpaRequestUseCase;

  beforeEach(() => {
    const partners = new InMemoryPartnerLookup();
    partners.put(tenantId, partner, {
      isActive: true,
      code: 'V1',
      name: 'Vendor 1',
      taxId: null,
    });
    partners.put(tenantId, inactive, {
      isActive: false,
      code: 'V0',
      name: 'Gone',
      taxId: null,
    });
    requests = new InMemoryPdpaRequestRepository();
    sut = new CreatePdpaRequestUseCase(
      requests,
      partners,
      new FixedTenantContext(tenantId, 'u-1'),
      new FixedClock(t0),
    );
  });

  it('creates a PENDING request stamped with actor and clock', async () => {
    const r = await sut.execute({
      partner,
      requestType: PdpaRequestType.Export,
      reason: 'portability',
    });
    const s = r.snapshot();
    expect(s.status).toBe(PdpaRequestStatus.Pending);
    expect(s.requestedBy).toBe('u-1');
    expect(s.requestedAt).toEqual(t0);
    expect(requests.rows.size).toBe(1);
  });

  it('refuses a second pending request of the same type', async () => {
    await sut.execute({ partner, requestType: PdpaRequestType.Erasure });
    await expect(
      sut.execute({ partner, requestType: PdpaRequestType.Erasure }),
    ).rejects.toThrow(PdpaRequestAlreadyOpenError);
    // a different type is fine
    await expect(
      sut.execute({ partner, requestType: PdpaRequestType.Export }),
    ).resolves.toBeDefined();
  });

  it('unknown or inactive partner reads as not found', async () => {
    await expect(
      sut.execute({
        partner: { type: PartnerType.Vendor, id: 'nope' },
        requestType: PdpaRequestType.Export,
      }),
    ).rejects.toThrow(PartnerNotFoundError);
    await expect(
      sut.execute({ partner: inactive, requestType: PdpaRequestType.Export }),
    ).rejects.toThrow(PartnerNotFoundError);
  });
});
