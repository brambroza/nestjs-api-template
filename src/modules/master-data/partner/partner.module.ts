import { Module } from '@nestjs/common';

import { PartnerAddressController } from './api/partner-address.controller';
import { PartnerContactController } from './api/partner-contact.controller';
import { PartnerPdpaController } from './api/partner-pdpa.controller';
import {
  AddAddressUseCase,
  AddContactUseCase,
  CreatePdpaRequestUseCase,
  FulfilPdpaRequestUseCase,
  GetConsentStateUseCase,
  ListAddressesUseCase,
  ListContactsUseCase,
  ListPdpaRequestsUseCase,
  RecordConsentUseCase,
  RejectPdpaRequestUseCase,
} from './application';
import { ADDRESS_REPOSITORY } from './application/ports/address.repository';
import { CONSENT_REPOSITORY } from './application/ports/consent.repository';
import { CONTACT_REPOSITORY } from './application/ports/contact.repository';
import { PARTNER_LOOKUP } from './application/ports/partner-lookup.port';
import { PDPA_REQUEST_REPOSITORY } from './application/ports/pdpa-request.repository';
import { PrismaAddressRepository } from './infrastructure/prisma-address.repository';
import { PrismaConsentRepository } from './infrastructure/prisma-consent.repository';
import { PrismaContactRepository } from './infrastructure/prisma-contact.repository';
import { PrismaPartnerLookup } from './infrastructure/prisma-partner-lookup';
import { PrismaPdpaRequestRepository } from './infrastructure/prisma-pdpa-request.repository';

/**
 * Contacts, address book and PDPA for both customers and vendors.
 * TRANSACTION_MANAGER / TENANT_CONTEXT / CLOCK come from global modules.
 */
@Module({
  controllers: [
    PartnerContactController,
    PartnerAddressController,
    PartnerPdpaController,
  ],
  providers: [
    { provide: PARTNER_LOOKUP, useClass: PrismaPartnerLookup },
    { provide: CONTACT_REPOSITORY, useClass: PrismaContactRepository },
    { provide: ADDRESS_REPOSITORY, useClass: PrismaAddressRepository },
    { provide: CONSENT_REPOSITORY, useClass: PrismaConsentRepository },
    { provide: PDPA_REQUEST_REPOSITORY, useClass: PrismaPdpaRequestRepository },
    AddContactUseCase,
    ListContactsUseCase,
    AddAddressUseCase,
    ListAddressesUseCase,
    RecordConsentUseCase,
    GetConsentStateUseCase,
    CreatePdpaRequestUseCase,
    ListPdpaRequestsUseCase,
    FulfilPdpaRequestUseCase,
    RejectPdpaRequestUseCase,
  ],
  exports: [ListContactsUseCase, ListAddressesUseCase, GetConsentStateUseCase],
})
export class PartnerModule {}
