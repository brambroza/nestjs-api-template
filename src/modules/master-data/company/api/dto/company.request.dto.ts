import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateCompanyRequestDto {
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
  @Length(1, 200)
  legalName?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(13, 20)
  taxId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(['THB', 'USD', 'JPY'])
  baseCurrency?: string;
}

export class ListCompaniesQueryDto {
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
}
