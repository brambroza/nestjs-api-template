import {
  Contact,
  ERASED_PLACEHOLDER,
  InvalidContactFieldError,
} from './contact';
import { PartnerType } from './partner-ref';

describe('Contact aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const base = {
    id: 'ct-1',
    tenantId: 't-1',
    partner: { type: PartnerType.Customer, id: 'cust-1' },
    fullName: 'Somchai Jaidee',
    now,
  };

  it('creates with normalised email and defaults', () => {
    const s = Contact.create({
      ...base,
      email: ' Somchai@Example.COM ',
      phone: '+66 81-234-5678',
    }).snapshot();
    expect(s.email).toBe('somchai@example.com');
    expect(s.phone).toBe('+66 81-234-5678');
    expect(s.isPrimary).toBe(false);
    expect(s.isActive).toBe(true);
    expect(s.erasedAt).toBeNull();
  });

  it('rejects malformed email and phone', () => {
    expect(() => Contact.create({ ...base, email: 'not-an-email' })).toThrow(
      InvalidContactFieldError,
    );
    expect(() => Contact.create({ ...base, phone: 'call me' })).toThrow(
      InvalidContactFieldError,
    );
  });

  it('erase() overwrites personal fields, demotes primary, stamps erasedAt', () => {
    const later = new Date('2026-10-01T00:00:00.000Z');
    const c = Contact.create({
      ...base,
      email: 'a@b.co',
      phone: '0812345678',
      position: 'CFO',
      isPrimary: true,
    });
    const erased = c.erase(later);
    const s = erased.snapshot();
    expect(s.fullName).toBe(ERASED_PLACEHOLDER);
    expect(s.email).toBeNull();
    expect(s.phone).toBeNull();
    expect(s.position).toBeNull();
    expect(s.isPrimary).toBe(false);
    expect(s.isActive).toBe(false);
    expect(s.erasedAt).toEqual(later);
    expect(s.updatedAt).toEqual(later);
    // identity + linkage preserved
    expect(s.id).toBe('ct-1');
    expect(s.partner).toEqual(base.partner);
    expect(s.createdAt).toEqual(now);
    // original untouched (immutable)
    expect(c.snapshot().fullName).toBe('Somchai Jaidee');
  });

  it('erase() is idempotent', () => {
    const t1 = new Date('2026-10-01T00:00:00.000Z');
    const t2 = new Date('2026-11-01T00:00:00.000Z');
    const once = Contact.create(base).erase(t1);
    const twice = once.erase(t2);
    expect(twice).toBe(once);
    expect(twice.snapshot().erasedAt).toEqual(t1);
  });
});
