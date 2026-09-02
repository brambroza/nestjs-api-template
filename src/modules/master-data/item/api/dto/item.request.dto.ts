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

import { TrackingPolicy } from '../../domain';

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

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  categoryId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(TrackingPolicy))
  trackingPolicy?: TrackingPolicy;

  @Expose()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  shelfLifeDays?: number;
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

export class ImportItemsQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  dryRun?: boolean;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  allowPartial?: boolean;
}
