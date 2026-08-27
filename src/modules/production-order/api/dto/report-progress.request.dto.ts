import { Expose, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { QuantityDto } from './common.dto';

export class ReportProgressRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => QuantityDto)
  quantity!: QuantityDto;
}
