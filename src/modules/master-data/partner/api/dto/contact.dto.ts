import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import type { Contact } from '../../domain';

export class CreateContactRequestDto {
  @Expose()
  @IsString()
  @Length(1, 200)
  fullName!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  position?: string;

  @Expose()
  @IsOptional()
  @IsEmail()
  @Length(3, 200)
  email?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9][0-9 \-()]{3,28}$/, {
    message:
      'phone may contain digits, spaces, dashes, parentheses and a leading +',
  })
  phone?: string;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class ListContactsQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class ContactResponseDto {
  @Expose() id!: string;
  @Expose() partnerType!: string;
  @Expose() partnerId!: string;
  @Expose() fullName!: string;
  @Expose() position!: string | null;
  @Expose() email!: string | null;
  @Expose() phone!: string | null;
  @Expose() isPrimary!: boolean;
  @Expose() isActive!: boolean;
  @Expose() erasedAt!: string | null;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ContactListResponseDto {
  @Expose()
  @Type(() => ContactResponseDto)
  items!: ContactResponseDto[];
}

export function toContactResponseDto(c: Contact): ContactResponseDto {
  const s = c.snapshot();
  const dto = new ContactResponseDto();
  dto.id = s.id;
  dto.partnerType = s.partner.type;
  dto.partnerId = s.partner.id;
  dto.fullName = s.fullName;
  dto.position = s.position;
  dto.email = s.email;
  dto.phone = s.phone;
  dto.isPrimary = s.isPrimary;
  dto.isActive = s.isActive;
  dto.erasedAt = s.erasedAt?.toISOString() ?? null;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}
