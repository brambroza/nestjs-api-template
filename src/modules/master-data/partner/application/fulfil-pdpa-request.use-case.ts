import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  PdpaRequestNotFoundError,
  PdpaRequestType,
  deriveConsentState,
  type ConsentRecordSnapshot,
  type ConsentState,
  type ContactSnapshot,
  type PartnerAddressSnapshot,
  type PartnerRef,
  type PdpaRequest,
  type PdpaRequestSnapshot,
} from '../domain';

import { requireActivePartner } from './partner-guard';
import {
  ADDRESS_REPOSITORY,
  type AddressRepository,
} from './ports/address.repository';
import {
  CONSENT_REPOSITORY,
  type ConsentRepository,
} from './ports/consent.repository';
import {
  CONTACT_REPOSITORY,
  type ContactRepository,
} from './ports/contact.repository';
import {
  PARTNER_LOOKUP,
  type PartnerLookup,
  type PartnerLookupResult,
} from './ports/partner-lookup.port';
import {
  PDPA_REQUEST_REPOSITORY,
  type PdpaRequestRepository,
} from './ports/pdpa-request.repository';

export interface FulfilPdpaRequestInput {
  readonly partner: PartnerRef;
  readonly requestId: string;
  readonly note?: string | null;
}

/** Data-portability bundle (PDPA §30): everything this module holds on the partner. */
export interface PartnerDataExport {
  readonly partner: PartnerRef & PartnerLookupResult;
  readonly generatedAt: Date;
  readonly contacts: readonly ContactSnapshot[];
  readonly addresses: readonly PartnerAddressSnapshot[];
  readonly consentState: readonly ConsentState[];
  readonly consentHistory: readonly ConsentRecordSnapshot[];
  readonly requests: readonly PdpaRequestSnapshot[];
}

export interface FulfilPdpaRequestResult {
  readonly request: PdpaRequest;
  /** Present only for EXPORT requests. */
  readonly export: PartnerDataExport | null;
}

/**
 * EXPORT  -> assemble the bundle, mark COMPLETED, return both.
 * ERASURE -> inside one transaction: overwrite every contact's personal
 *            fields (Contact.erase), mark COMPLETED with a count. The
 *            Customer/Vendor row and its addresses are NOT touched —
 *            they are business records the Revenue Code requires us to
 *            keep for 5 years (retention overrides erasure, PDPA §33(2)).
 *            The consent log is also kept: it is the evidence that we
 *            were allowed to process the data while we did.
 */
@Injectable()
export class FulfilPdpaRequestUseCase {
  constructor(
    @Inject(PDPA_REQUEST_REPOSITORY)
    private readonly requests: PdpaRequestRepository,
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: AddressRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(PARTNER_LOOKUP) private readonly partners: PartnerLookup,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: FulfilPdpaRequestInput,
  ): Promise<FulfilPdpaRequestResult> {
    const tenantId = this.tenant.getTenantId();
    const actor = this.tenant.getUserId();
    const header = await requireActivePartner(
      this.partners,
      tenantId,
      input.partner,
    );

    return this.tx.runInTransaction(async () => {
      const request = await this.loadOwned(tenantId, input);
      const now = this.clock.now();

      if (request.snapshot().requestType === PdpaRequestType.Erasure) {
        const all = await this.contacts.listByPartner(tenantId, input.partner, {
          activeOnly: false,
        });
        let erased = 0;
        for (const c of all) {
          if (c.isErased) continue;
          await this.contacts.save(c.erase(now));
          erased += 1;
        }
        const note = [
          `erased ${String(erased)} contact(s)`,
          input.note?.trim() ?? '',
        ]
          .filter((s) => s.length > 0)
          .join('; ');
        const done = request.complete(actor, now, note);
        await this.requests.save(done);
        return { request: done, export: null };
      }

      const bundle = await this.buildExport(
        tenantId,
        input.partner,
        header,
        now,
      );
      const done = request.complete(actor, now, input.note ?? null);
      await this.requests.save(done);
      return {
        request: done,
        export: {
          ...bundle,
          requests: bundle.requests.map((r) =>
            r.id === done.snapshot().id ? done.snapshot() : r,
          ),
        },
      };
    });
  }

  private async loadOwned(
    tenantId: string,
    input: FulfilPdpaRequestInput,
  ): Promise<PdpaRequest> {
    const request = await this.requests.findById(tenantId, input.requestId);
    const s = request?.snapshot();
    if (
      !request ||
      !s ||
      s.partner.type !== input.partner.type ||
      s.partner.id !== input.partner.id
    ) {
      throw new PdpaRequestNotFoundError(input.requestId);
    }
    return request;
  }

  private async buildExport(
    tenantId: string,
    partner: PartnerRef,
    header: PartnerLookupResult,
    generatedAt: Date,
  ): Promise<PartnerDataExport> {
    const [contacts, addresses, consentHistory, requests] = await Promise.all([
      this.contacts.listByPartner(tenantId, partner, { activeOnly: false }),
      this.addresses.listByPartner(tenantId, partner, { activeOnly: false }),
      this.consents.listByPartner(tenantId, partner),
      this.requests.listByPartner(tenantId, partner),
    ]);
    return {
      partner: { ...partner, ...header },
      generatedAt,
      contacts: contacts.map((c) => c.snapshot()),
      addresses: addresses.map((a) => a.snapshot()),
      consentState: deriveConsentState(consentHistory),
      consentHistory: consentHistory.map((c) => c.snapshot()),
      requests: requests.map((r) => r.snapshot()),
    };
  }
}
