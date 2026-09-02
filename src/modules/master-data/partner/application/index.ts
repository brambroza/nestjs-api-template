export * from './ports';
export {
  AddContactUseCase,
  type AddContactInput,
} from './add-contact.use-case';
export {
  ListContactsUseCase,
  type ListContactsInput,
} from './list-contacts.use-case';
export {
  AddAddressUseCase,
  type AddAddressInput,
} from './add-address.use-case';
export {
  ListAddressesUseCase,
  type ListAddressesInput,
} from './list-addresses.use-case';
export {
  RecordConsentUseCase,
  type RecordConsentInput,
} from './record-consent.use-case';
export {
  GetConsentStateUseCase,
  type ConsentView,
} from './get-consent-state.use-case';
export {
  CreatePdpaRequestUseCase,
  type CreatePdpaRequestInput,
} from './create-pdpa-request.use-case';
export { ListPdpaRequestsUseCase } from './list-pdpa-requests.use-case';
export {
  FulfilPdpaRequestUseCase,
  type FulfilPdpaRequestInput,
  type FulfilPdpaRequestResult,
  type PartnerDataExport,
} from './fulfil-pdpa-request.use-case';
export {
  RejectPdpaRequestUseCase,
  type RejectPdpaRequestInput,
} from './reject-pdpa-request.use-case';
