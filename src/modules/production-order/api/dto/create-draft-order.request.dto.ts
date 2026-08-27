import { Expose, Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

import { MoneyDto, QuantityDto } from './common.dto';

export class CreateDraftOrderRequestDto {
  @Expose()
  @IsOptional()
  @IsString()
  orderId?: string;

  @Expose()
  @ValidateNested()
  @Type(() => QuantityDto)
  orderedQuantity!: QuantityDto;

  @Expose()
  @ValidateNested()
  @Type(() => MoneyDto)
  totalAmount!: MoneyDto;
}
