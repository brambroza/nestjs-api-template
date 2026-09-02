import { Delegation, InvalidDelegationError } from './delegation';

describe('Delegation', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const base = {
    id: 'd',
    tenantId: 't',
    fromUserId: 'a',
    toUserId: 'b',
    fromDate: '2026-09-10',
    toDate: '2026-09-20',
    now,
  };

  it('is active only inside its window and while not revoked', () => {
    const d = Delegation.create(base);
    expect(d.isActiveOn('2026-09-09')).toBe(false);
    expect(d.isActiveOn('2026-09-10')).toBe(true);
    expect(d.isActiveOn('2026-09-20')).toBe(true);
    expect(d.isActiveOn('2026-09-21')).toBe(false);
    expect(d.revoke().isActiveOn('2026-09-15')).toBe(false);
  });

  it('rejects self-delegation and an inverted window', () => {
    expect(() => Delegation.create({ ...base, toUserId: 'a' })).toThrow(
      InvalidDelegationError,
    );
    expect(() => Delegation.create({ ...base, toDate: '2026-09-01' })).toThrow(
      InvalidDelegationError,
    );
  });
});
