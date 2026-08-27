import { Expose } from 'class-transformer';
import { IsIn, IsString, Matches, MinLength } from 'class-validator';

export class MoneyDto {
  /** Amount in the minor unit (satang for THB). Sent as a string so
   * JavaScript's Number does not corrupt values beyond 2^53. */
  @Expose()
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount!: string;

  @Expose()
  @IsIn(['THB', 'USD', 'JPY'])
  currency!: 'THB' | 'USD' | 'JPY';
}

export class QuantityDto {
  @Expose()
  @IsString()
  @Matches(/^\d+$/, { message: 'value must be a non-negative integer string' })
  value!: string;

  @Expose()
  @IsString()
  @MinLength(1)
  uom!: string;
}
