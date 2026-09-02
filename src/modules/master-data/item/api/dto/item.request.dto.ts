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

export class CreateItemRequestDto {
  @Expose()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'sku may contain letters, digits, dot, underscore, dash',
  })
  sku!: string;

  @Expose()
  @IsString()
  @Length(1, 200)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @Expose()
  @IsString()
  @Length(1, 16)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'defaultUomCode may contain letters, digits, underscore, dash',
  })
  defaultUomCode!: string;
}

export class ListItemsQueryDto {
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
