import { Expose, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

import { MoneyDto, QuantityDto } from './common.dto';

export class CreateDraftOrderRequestDto {
  @Expose()
  @IsOptional()
  @IsString()
  orderId?: string;

  /** SKU of the finished good. Optional for backward compatibility. */
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'productSku may contain letters, digits, dot, underscore, dash',
  })
  productSku?: string;

  @Expose()
  @ValidateNested()
  @Type(() => QuantityDto)
  orderedQuantity!: QuantityDto;

  @Expose()
  @ValidateNested()
  @Type(() => MoneyDto)
  totalAmount!: MoneyDto;
}
