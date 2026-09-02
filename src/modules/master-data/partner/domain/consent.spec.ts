import {
  ConsentAction,
  ConsentPurpose,
  ConsentRecord,
  ConsentSource,
  deriveConsentState,
} from './consent';
import { PartnerType } from './partner-ref';

describe('deriveConsentState', () => {
  const partner = { type: PartnerType.Customer, id: 'cust-1' };
  const rec = (
    id: string,
    purpose: ConsentPurpose,
    action: ConsentAction,
    at: string,
  ): ConsentRecord =>
    ConsentRecord.create({
      id,
      tenantId: 't-1',
      partner,
      purpose,
      action,
      source: ConsentSource.WebForm,
      recordedBy: 'u-1',
      recordedAt: new Date(at),
    });

  it('reports every purpose, not-granted when no records', () => {
    const state = deriveConsentState([]);
    expect(state).toHaveLength(3);
    expect(state.every((s) => !s.granted && s.since === null)).toBe(true);
  });

  it('latest record per purpose wins regardless of input order', () => {
    const state = deriveConsentState([
      rec('r2', ConsentPurpose.Marketing, ConsentAction.Withdraw, '2026-02-01'),
      rec('r1', ConsentPurpose.Marketing, ConsentAction.Grant, '2026-01-01'),
      rec('r3', ConsentPurpose.Analytics, ConsentAction.Grant, '2026-01-15'),
    ]);
    const marketing = state.find((s) => s.purpose === ConsentPurpose.Marketing);
    const analytics = state.find((s) => s.purpose === ConsentPurpose.Analytics);
    const sharing = state.find(
      (s) => s.purpose === ConsentPurpose.ThirdPartySharing,
    );
    expect(marketing?.granted).toBe(false);
    expect(marketing?.lastRecordId).toBe('r2');
    expect(marketing?.since).toEqual(new Date('2026-02-01'));
    expect(analytics?.granted).toBe(true);
    expect(analytics?.lastRecordId).toBe('r3');
    expect(sharing?.granted).toBe(false);
    expect(sharing?.lastRecordId).toBeNull();
  });

  it('on an exact timestamp tie, the later input element wins', () => {
    const state = deriveConsentState([
      rec('a', ConsentPurpose.Marketing, ConsentAction.Grant, '2026-01-01'),
      rec('b', ConsentPurpose.Marketing, ConsentAction.Withdraw, '2026-01-01'),
    ]);
    expect(
      state.find((s) => s.purpose === ConsentPurpose.Marketing)?.lastRecordId,
    ).toBe('b');
  });
});
