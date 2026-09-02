import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import {
  AccountType,
  normalBalanceOf,
  type Account,
  type AccountSnapshot,
  type AccountTreeNode,
} from '../../domain';

export class CreateAccountRequestDto {
  @Expose()
  @IsString()
  @Length(1, 16)
  @Matches(/^[0-9A-Za-z.-]+$/)
  code!: string;
  @Expose() @IsString() @Length(1, 200) name!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) nameTh?: string;
  @Expose() @IsString() @IsIn(Object.values(AccountType)) type!: AccountType;
  @Expose() @IsOptional() @IsString() @Length(1, 36) parentId?: string;
  @Expose() @IsOptional() @IsBoolean() isPostable?: boolean;
}

export class ListAccountsQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class AccountResponseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() nameTh!: string | null;
  @Expose() type!: string;
  @Expose() normalBalance!: string;
  @Expose() parentId!: string | null;
  @Expose() depth!: number;
  @Expose() isPostable!: boolean;
  @Expose() isActive!: boolean;
}

export class AccountTreeNodeDto {
  @Expose() @Type(() => AccountResponseDto) account!: AccountResponseDto;
  @Expose() @Type(() => AccountTreeNodeDto) children!: AccountTreeNodeDto[];
}

export class AccountTreeResponseDto {
  @Expose() @Type(() => AccountTreeNodeDto) roots!: AccountTreeNodeDto[];
}

function fromSnapshot(s: AccountSnapshot): AccountResponseDto {
  const dto = new AccountResponseDto();
  dto.id = s.id;
  dto.code = s.code;
  dto.name = s.name;
  dto.nameTh = s.nameTh;
  dto.type = s.type;
  dto.normalBalance = normalBalanceOf(s.type);
  dto.parentId = s.parentId;
  dto.depth = s.depth;
  dto.isPostable = s.isPostable;
  dto.isActive = s.isActive;
  return dto;
}

export function toAccountDto(a: Account): AccountResponseDto {
  return fromSnapshot(a.snapshot());
}

export function toAccountTreeNodeDto(n: AccountTreeNode): AccountTreeNodeDto {
  const dto = new AccountTreeNodeDto();
  dto.account = fromSnapshot(n.account);
  dto.children = n.children.map(toAccountTreeNodeDto);
  return dto;
}
