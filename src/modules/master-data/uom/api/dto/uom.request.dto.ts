import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateUomRequestDto {
  @Expose()
  @IsString()
  @Length(1, 16)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may contain letters, digits, underscore, dash',
  })
  code!: string;

  @Expose()
  @IsString()
  @Length(1, 64)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'baseUomCode may contain letters, digits, underscore, dash',
  })
  baseUomCode?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/, {
    message: 'conversionRatio must be a positive integer string',
  })
  conversionRatio?: string;
}

export class ListUomsQueryDto {
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
}
