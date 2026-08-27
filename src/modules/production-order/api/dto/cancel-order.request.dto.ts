import { Expose } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOrderRequestDto {
  @Expose()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
