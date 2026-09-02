import { PartnerType } from './partner-ref';
import {
  IllegalPdpaRequestTransitionError,
  PdpaRequest,
  PdpaRequestStatus,
  PdpaRequestType,
} from './pdpa-request';

describe('PdpaRequest lifecycle', () => {
  const t0 = new Date('2026-09-01T00:00:00.000Z');
  const t1 = new Date('2026-09-05T00:00:00.000Z');
  const make = (): PdpaRequest =>
    PdpaRequest.create({
      id: 'req-1',
      tenantId: 't-1',
      partner: { type: PartnerType.Customer, id: 'cust-1' },
      requestType: PdpaRequestType.Erasure,
      reason: ' customer asked by email ',
      requestedBy: 'u-1',
      requestedAt: t0,
    });

  it('starts PENDING with trimmed reason', () => {
    const s = make().snapshot();
    expect(s.status).toBe(PdpaRequestStatus.Pending);
    expect(s.reason).toBe('customer asked by email');
    expect(s.completedAt).toBeNull();
  });

  it('PENDING -> COMPLETED records who/when/note', () => {
    const s = make().complete('u-2', t1, 'erased 3 contacts').snapshot();
    expect(s.status).toBe(PdpaRequestStatus.Completed);
    expect(s.completedBy).toBe('u-2');
    expect(s.completedAt).toEqual(t1);
    expect(s.resultNote).toBe('erased 3 contacts');
  });

  it('PENDING -> REJECTED', () => {
    expect(make().reject('u-2', t1, 'retention').snapshot().status).toBe(
      PdpaRequestStatus.Rejected,
    );
  });

  it('terminal states never transition again', () => {
    const done = make().complete('u-2', t1);
    expect(() => done.reject('u-3', t1)).toThrow(
      IllegalPdpaRequestTransitionError,
    );
    expect(() => done.complete('u-3', t1)).toThrow(
      IllegalPdpaRequestTransitionError,
    );
    const rejected = make().reject('u-2', t1);
    expect(() => rejected.complete('u-3', t1)).toThrow(
      IllegalPdpaRequestTransitionError,
    );
  });
});
