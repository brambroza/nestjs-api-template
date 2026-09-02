import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { AddressType, type PartnerAddress } from '../../domain';

export class CreateAddressRequestDto {
  @Expose()
  @IsString()
  @IsIn(Object.values(AddressType))
  addressType!: AddressType;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @Expose()
  @IsString()
  @Length(1, 200)
  line1!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  line2?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  subDistrict?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  district?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  province?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, { message: 'postalCode must be 5 digits' })
  postalCode?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'countryCode must be ISO 3166-1 alpha-2',
  })
  countryCode?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, {
    message: 'branchNumber must be 5 digits (00000 = head office)',
  })
  branchNumber?: string;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ListAddressesQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

class AddressFieldsResponseDto {
  @Expose() line1!: string;
  @Expose() line2!: string | null;
  @Expose() subDistrict!: string | null;
  @Expose() district!: string | null;
  @Expose() province!: string | null;
  @Expose() postalCode!: string | null;
}

export class AddressResponseDto {
  @Expose() id!: string;
  @Expose() partnerType!: string;
  @Expose() partnerId!: string;
  @Expose() addressType!: string;
  @Expose() label!: string | null;

  @Expose()
  @Type(() => AddressFieldsResponseDto)
  address!: AddressFieldsResponseDto;

  @Expose() countryCode!: string;
  @Expose() branchNumber!: string | null;
  @Expose() isDefault!: boolean;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class AddressListResponseDto {
  @Expose()
  @Type(() => AddressResponseDto)
  items!: AddressResponseDto[];
}

export function toAddressResponseDto(a: PartnerAddress): AddressResponseDto {
  const s = a.snapshot();
  const dto = new AddressResponseDto();
  dto.id = s.id;
  dto.partnerType = s.partner.type;
  dto.partnerId = s.partner.id;
  dto.addressType = s.addressType;
  dto.label = s.label;
  const f = new AddressFieldsResponseDto();
  f.line1 = s.address.line1;
  f.line2 = s.address.line2;
  f.subDistrict = s.address.subDistrict;
  f.district = s.address.district;
  f.province = s.address.province;
  f.postalCode = s.address.postalCode;
  dto.address = f;
  dto.countryCode = s.countryCode;
  dto.branchNumber = s.branchNumber;
  dto.isDefault = s.isDefault;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
