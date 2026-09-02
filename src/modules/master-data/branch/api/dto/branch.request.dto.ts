import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BranchAddressDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  line1?: string;

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
}

export class CreateBranchRequestDto {
  @Expose()
  @IsString()
  @Length(1, 36)
  companyId!: string;

  @Expose()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9._\- ]+$/, {
    message: 'code may contain letters, digits, dot, underscore, dash, space',
  })
  code!: string;

  @Expose()
  @IsString()
  @Length(1, 200)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, {
    message: 'branchNumber must be 5 digits (00000 = head office)',
  })
  branchNumber?: string;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchAddressDto)
  address?: BranchAddressDto;
}

export class ListBranchesQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  companyId?: string;
}
