import { Expose, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import {
  ConsentAction,
  ConsentPurpose,
  ConsentSource,
  PdpaRequestType,
  type ConsentRecord,
  type ConsentState,
  type PdpaRequest,
} from '../../domain';
import type { PartnerDataExport } from '../../application';

import { AddressResponseDto, toAddressResponseDto } from './address.dto';
import { ContactResponseDto, toContactResponseDto } from './contact.dto';

// ---- consent ---------------------------------------------------------------

export class RecordConsentRequestDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  contactId?: string;

  @Expose()
  @IsString()
  @IsIn(Object.values(ConsentPurpose))
  purpose!: ConsentPurpose;

  @Expose()
  @IsString()
  @IsIn(Object.values(ConsentAction))
  action!: ConsentAction;

  @Expose()
  @IsString()
  @IsIn(Object.values(ConsentSource))
  source!: ConsentSource;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  evidenceRef?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class ConsentRecordResponseDto {
  @Expose() id!: string;
  @Expose() contactId!: string | null;
  @Expose() purpose!: string;
  @Expose() action!: string;
  @Expose() source!: string;
  @Expose() evidenceRef!: string | null;
  @Expose() note!: string | null;
  @Expose() recordedBy!: string;
  @Expose() recordedAt!: string;
}

export class ConsentStateResponseDto {
  @Expose() purpose!: string;
  @Expose() granted!: boolean;
  @Expose() since!: string | null;
  @Expose() lastRecordId!: string | null;
}

export class ConsentViewResponseDto {
  @Expose()
  @Type(() => ConsentStateResponseDto)
  state!: ConsentStateResponseDto[];

  @Expose()
  @Type(() => ConsentRecordResponseDto)
  history!: ConsentRecordResponseDto[];
}

export function toConsentRecordDto(r: ConsentRecord): ConsentRecordResponseDto {
  const s = r.snapshot();
  const dto = new ConsentRecordResponseDto();
  dto.id = s.id;
  dto.contactId = s.contactId;
  dto.purpose = s.purpose;
  dto.action = s.action;
  dto.source = s.source;
  dto.evidenceRef = s.evidenceRef;
  dto.note = s.note;
  dto.recordedBy = s.recordedBy;
  dto.recordedAt = s.recordedAt.toISOString();
  return dto;
}

export function toConsentStateDto(s: ConsentState): ConsentStateResponseDto {
  const dto = new ConsentStateResponseDto();
  dto.purpose = s.purpose;
  dto.granted = s.granted;
  dto.since = s.since?.toISOString() ?? null;
  dto.lastRecordId = s.lastRecordId;
  return dto;
}

// ---- requests --------------------------------------------------------------

export class CreatePdpaRequestDto {
  @Expose()
  @IsString()
  @IsIn(Object.values(PdpaRequestType))
  requestType!: PdpaRequestType;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class FulfilPdpaRequestDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class RejectPdpaRequestDto {
  @Expose()
  @IsString()
  @Length(1, 500)
  note!: string;
}

export class PdpaRequestResponseDto {
  @Expose() id!: string;
  @Expose() partnerType!: string;
  @Expose() partnerId!: string;
  @Expose() requestType!: string;
  @Expose() status!: string;
  @Expose() reason!: string | null;
  @Expose() requestedBy!: string;
  @Expose() requestedAt!: string;
  @Expose() completedBy!: string | null;
  @Expose() completedAt!: string | null;
  @Expose() resultNote!: string | null;
}

export class PdpaRequestListResponseDto {
  @Expose()
  @Type(() => PdpaRequestResponseDto)
  items!: PdpaRequestResponseDto[];
}

export function toPdpaRequestDto(r: PdpaRequest): PdpaRequestResponseDto {
  const s = r.snapshot();
  const dto = new PdpaRequestResponseDto();
  dto.id = s.id;
  dto.partnerType = s.partner.type;
  dto.partnerId = s.partner.id;
  dto.requestType = s.requestType;
  dto.status = s.status;
  dto.reason = s.reason;
  dto.requestedBy = s.requestedBy;
  dto.requestedAt = s.requestedAt.toISOString();
  dto.completedBy = s.completedBy;
  dto.completedAt = s.completedAt?.toISOString() ?? null;
  dto.resultNote = s.resultNote;
  return dto;
}

// ---- export bundle ---------------------------------------------------------

class ExportPartnerHeaderDto {
  @Expose() type!: string;
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() taxId!: string | null;
  @Expose() isActive!: boolean;
}

export class PartnerDataExportDto {
  @Expose()
  @Type(() => ExportPartnerHeaderDto)
  partner!: ExportPartnerHeaderDto;

  @Expose() generatedAt!: string;

  @Expose()
  @Type(() => ContactResponseDto)
  contacts!: ContactResponseDto[];

  @Expose()
  @Type(() => AddressResponseDto)
  addresses!: AddressResponseDto[];

  @Expose()
  @Type(() => ConsentStateResponseDto)
  consentState!: ConsentStateResponseDto[];

  @Expose()
  @Type(() => ConsentRecordResponseDto)
  consentHistory!: ConsentRecordResponseDto[];

  @Expose()
  @Type(() => PdpaRequestResponseDto)
  requests!: PdpaRequestResponseDto[];
}

export class FulfilPdpaRequestResponseDto {
  @Expose()
  @Type(() => PdpaRequestResponseDto)
  request!: PdpaRequestResponseDto;

  @Expose()
  @Type(() => PartnerDataExportDto)
  export!: PartnerDataExportDto | null;
}

export function toPartnerDataExportDto(
  e: PartnerDataExport,
): PartnerDataExportDto {
  const dto = new PartnerDataExportDto();
  const h = new ExportPartnerHeaderDto();
  h.type = e.partner.type;
  h.id = e.partner.id;
  h.code = e.partner.code;
  h.name = e.partner.name;
  h.taxId = e.partner.taxId;
  h.isActive = e.partner.isActive;
  dto.partner = h;
  dto.generatedAt = e.generatedAt.toISOString();
  // Snapshots -> aggregates -> DTOs keeps a single mapping path per type.
  dto.contacts = e.contacts.map((s) => {
    const d = new ContactResponseDto();
    d.id = s.id;
    d.partnerType = s.partner.type;
    d.partnerId = s.partner.id;
    d.fullName = s.fullName;
    d.position = s.position;
    d.email = s.email;
    d.phone = s.phone;
    d.isPrimary = s.isPrimary;
    d.isActive = s.isActive;
    d.erasedAt = s.erasedAt?.toISOString() ?? null;
    d.createdAt = s.createdAt.toISOString();
    d.updatedAt = s.updatedAt.toISOString();
    return d;
  });
  dto.addresses = e.addresses.map((s) => {
    const d = new AddressResponseDto();
    d.id = s.id;
    d.partnerType = s.partner.type;
    d.partnerId = s.partner.id;
    d.addressType = s.addressType;
    d.label = s.label;
    d.address = { ...s.address };
    d.countryCode = s.countryCode;
    d.branchNumber = s.branchNumber;
    d.isDefault = s.isDefault;
    d.isActive = s.isActive;
    d.createdAt = s.createdAt.toISOString();
    d.updatedAt = s.updatedAt.toISOString();
    return d;
  });
  dto.consentState = e.consentState.map(toConsentStateDto);
  dto.consentHistory = e.consentHistory.map((s) => {
    const d = new ConsentRecordResponseDto();
    d.id = s.id;
    d.contactId = s.contactId;
    d.purpose = s.purpose;
    d.action = s.action;
    d.source = s.source;
    d.evidenceRef = s.evidenceRef;
    d.note = s.note;
    d.recordedBy = s.recordedBy;
    d.recordedAt = s.recordedAt.toISOString();
    return d;
  });
  dto.requests = e.requests.map((s) => {
    const d = new PdpaRequestResponseDto();
    d.id = s.id;
    d.partnerType = s.partner.type;
    d.partnerId = s.partner.id;
    d.requestType = s.requestType;
    d.status = s.status;
    d.reason = s.reason;
    d.requestedBy = s.requestedBy;
    d.requestedAt = s.requestedAt.toISOString();
    d.completedBy = s.completedBy;
    d.completedAt = s.completedAt?.toISOString() ?? null;
    d.resultNote = s.resultNote;
    return d;
  });
  return dto;
}

// re-exported so the controller imports one module
export { toAddressResponseDto, toContactResponseDto };
