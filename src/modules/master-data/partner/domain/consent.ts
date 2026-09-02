import { DomainError } from '../../../../shared/errors';

import type { PartnerRef } from './partner-ref';

export const ConsentPurpose = {
  Marketing: 'MARKETING',
  Analytics: 'ANALYTICS',
  ThirdPartySharing: 'THIRD_PARTY_SHARING',
} as const;
export type ConsentPurpose =
  (typeof ConsentPurpose)[keyof typeof ConsentPurpose];
export const ALL_CONSENT_PURPOSES: readonly ConsentPurpose[] =
  Object.values(ConsentPurpose);

export const ConsentAction = {
  Grant: 'GRANT',
  Withdraw: 'WITHDRAW',
} as const;
export type ConsentAction = (typeof ConsentAction)[keyof typeof ConsentAction];

export const ConsentSource = {
  WebForm: 'WEB_FORM',
  PaperForm: 'PAPER_FORM',
  Verbal: 'VERBAL',
  Email: 'EMAIL',
  Api: 'API',
} as const;
export type ConsentSource = (typeof ConsentSource)[keyof typeof ConsentSource];

export function isConsentPurpose(v: string): v is ConsentPurpose {
  return (ALL_CONSENT_PURPOSES as readonly string[]).includes(v);
}
export function isConsentAction(v: string): v is ConsentAction {
  return v === ConsentAction.Grant || v === ConsentAction.Withdraw;
}
export function isConsentSource(v: string): v is ConsentSource {
  return (Object.values(ConsentSource) as readonly string[]).includes(v);
}

export class InvalidConsentFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_CONSENT_FIELD';
}

export interface ConsentRecordSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly contactId: string | null;
  readonly purpose: ConsentPurpose;
  readonly action: ConsentAction;
  readonly source: ConsentSource;
  readonly evidenceRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly recordedAt: Date;
}

export interface CreateConsentRecordProps {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly contactId?: string | null;
  readonly purpose: ConsentPurpose;
  readonly action: ConsentAction;
  readonly source: ConsentSource;
  readonly evidenceRef?: string | null;
  readonly note?: string | null;
  readonly recordedBy: string;
  readonly recordedAt: Date;
}

/**
 * One immutable row in the consent log. There is deliberately no
 * `withdraw()` method — withdrawal is a NEW record with action=WITHDRAW,
 * never a mutation, so the audit trail stays append-only.
 */
export class ConsentRecord {
  private constructor(private readonly s: ConsentRecordSnapshot) {}

  static create(props: CreateConsentRecordProps): ConsentRecord {
    const evidenceRef = (props.evidenceRef ?? '').trim() || null;
    if (evidenceRef !== null && evidenceRef.length > 200) {
      throw new InvalidConsentFieldError(
        'evidenceRef must be at most 200 characters',
      );
    }
    const note = (props.note ?? '').trim() || null;
    if (note !== null && note.length > 500) {
      throw new InvalidConsentFieldError('note must be at most 500 characters');
    }
    return new ConsentRecord({
      id: props.id,
      tenantId: props.tenantId,
      partner: props.partner,
      contactId: props.contactId ?? null,
      purpose: props.purpose,
      action: props.action,
      source: props.source,
      evidenceRef,
      note,
      recordedBy: props.recordedBy,
      recordedAt: props.recordedAt,
    });
  }

  static fromSnapshot(s: ConsentRecordSnapshot): ConsentRecord {
    return new ConsentRecord(s);
  }

  snapshot(): ConsentRecordSnapshot {
    return this.s;
  }
}

export interface ConsentState {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  /** When the current state took effect; null if never recorded. */
  readonly since: Date | null;
  readonly lastRecordId: string | null;
}

/**
 * Folds the append-only log into current state per purpose. Latest
 * `recordedAt` wins; on an exact tie the later element in the input
 * (insertion order) wins. Purposes with no records are reported as
 * not granted — absence of consent is never consent.
 */
export function deriveConsentState(
  records: readonly ConsentRecord[],
): readonly ConsentState[] {
  const latest = new Map<ConsentPurpose, ConsentRecordSnapshot>();
  for (const r of records) {
    const s = r.snapshot();
    const cur = latest.get(s.purpose);
    if (!cur || s.recordedAt.getTime() >= cur.recordedAt.getTime()) {
      latest.set(s.purpose, s);
    }
  }
  return ALL_CONSENT_PURPOSES.map((purpose) => {
    const s = latest.get(purpose);
    return s
      ? {
          purpose,
          granted: s.action === ConsentAction.Grant,
          since: s.recordedAt,
          lastRecordId: s.id,
        }
      : { purpose, granted: false, since: null, lastRecordId: null };
  });
}
