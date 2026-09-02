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
} from 'class-validator';

/**
 * Values arrive as JSON strings when they exceed 2^53 — we accept
 * either a number or a numeric string and normalize to bigint at the
 * use-case boundary. See `toBigInt` in the mapper.
 */
export class CreateCustomerRequestDto {
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
  @Length(1, 20)
  taxId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,19}$/, {
    message: 'creditLimitSatang must be a non-negative integer string',
  })
  creditLimitSatang?: string;

  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
}

export class ListCustomersQueryDto {
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
