import { DomainError } from '../../../../shared/errors';

import type { PartnerRef } from './partner-ref';

export class ContactNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.CONTACT_NOT_FOUND';
  constructor(readonly contactId: string) {
    super(`Contact ${contactId} not found`);
  }
}

export class PrimaryContactExistsError extends DomainError {
  readonly code = 'MASTER_DATA.PRIMARY_CONTACT_EXISTS';
  constructor(
    readonly partner: PartnerRef,
    readonly existingContactId: string,
  ) {
    super(
      `${partner.type} ${partner.id} already has a primary contact (${existingContactId})`,
    );
  }
}

export class InvalidContactFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_CONTACT_FIELD';
}

export interface ContactSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly fullName: string;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isPrimary: boolean;
  readonly isActive: boolean;
  readonly erasedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateContactProps {
  readonly id: string;
  readonly tenantId: string;
  readonly partner: PartnerRef;
  readonly fullName: string;
  readonly position?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly isPrimary?: boolean;
  readonly now: Date;
}

/** Placeholder written over personal fields when a PDPA erasure is fulfilled. */
export const ERASED_PLACEHOLDER = '[erased]';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 \-()]{3,28}$/;

/**
 * A natural person attached to a partner. This is the aggregate PDPA
 * cares about: `erase()` overwrites the personal fields in place and
 * stamps `erasedAt`, keeping the row so historical documents that
 * reference the contact id still resolve.
 */
export class Contact {
  private constructor(private readonly s: ContactSnapshot) {}

  static create(props: CreateContactProps): Contact {
    const fullName = props.fullName.trim();
    if (fullName.length === 0 || fullName.length > 200) {
      throw new InvalidContactFieldError(
        'fullName must be a non-empty string up to 200 characters',
      );
    }
    const position = optional(props.position, 100, 'position');
    const email = optional(props.email, 200, 'email');
    if (email !== null && !EMAIL_RE.test(email)) {
      throw new InvalidContactFieldError('email is not a valid address');
    }
    const phone = optional(props.phone, 30, 'phone');
    if (phone !== null && !PHONE_RE.test(phone)) {
      throw new InvalidContactFieldError(
        'phone may contain digits, spaces, dashes, parentheses and a leading +',
      );
    }
    return new Contact({
      id: props.id,
      tenantId: props.tenantId,
      partner: props.partner,
      fullName,
      position,
      email: email?.toLowerCase() ?? null,
      phone,
      isPrimary: props.isPrimary ?? false,
      isActive: true,
      erasedAt: null,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ContactSnapshot): Contact {
    return new Contact(s);
  }

  /** Idempotent: erasing an already-erased contact returns it unchanged. */
  erase(now: Date): Contact {
    if (this.s.erasedAt !== null) return this;
    return new Contact({
      ...this.s,
      fullName: ERASED_PLACEHOLDER,
      position: null,
      email: null,
      phone: null,
      isPrimary: false,
      isActive: false,
      erasedAt: now,
      updatedAt: now,
    });
  }

  get isErased(): boolean {
    return this.s.erasedAt !== null;
  }

  snapshot(): ContactSnapshot {
    return this.s;
  }
}

function optional(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length === 0) return null;
  if (t.length > max) {
    throw new InvalidContactFieldError(
      `${field} must be at most ${String(max)} characters`,
    );
  }
  return t;
}
