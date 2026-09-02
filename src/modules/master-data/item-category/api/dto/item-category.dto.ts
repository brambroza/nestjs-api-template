import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import type {
  CategoryTreeNode,
  ItemCategory,
  ItemCategorySnapshot,
} from '../../domain';

export class CreateItemCategoryRequestDto {
  @Expose()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'code may contain letters, digits, dot, underscore, dash',
  })
  code!: string;

  @Expose()
  @IsString()
  @Length(1, 200)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  parentId?: string;
}

export class ListItemCategoriesQueryDto {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class ItemCategoryResponseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() name!: string;
  @Expose() parentId!: string | null;
  @Expose() path!: string;
  @Expose() depth!: number;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class ItemCategoryTreeNodeDto {
  @Expose()
  @Type(() => ItemCategoryResponseDto)
  category!: ItemCategoryResponseDto;

  @Expose()
  @Type(() => ItemCategoryTreeNodeDto)
  children!: ItemCategoryTreeNodeDto[];
}

export class ItemCategoryTreeResponseDto {
  @Expose()
  @Type(() => ItemCategoryTreeNodeDto)
  roots!: ItemCategoryTreeNodeDto[];
}

function fromSnapshot(s: ItemCategorySnapshot): ItemCategoryResponseDto {
  const dto = new ItemCategoryResponseDto();
  dto.id = s.id;
  dto.code = s.code;
  dto.name = s.name;
  dto.parentId = s.parentId;
  dto.path = s.path;
  dto.depth = s.depth;
  dto.isActive = s.isActive;
  dto.createdAt = s.createdAt.toISOString();
  dto.updatedAt = s.updatedAt.toISOString();
  return dto;
}

export function toItemCategoryResponseDto(
  c: ItemCategory,
): ItemCategoryResponseDto {
  return fromSnapshot(c.snapshot());
}

export function toTreeNodeDto(n: CategoryTreeNode): ItemCategoryTreeNodeDto {
  const dto = new ItemCategoryTreeNodeDto();
  dto.category = fromSnapshot(n.category);
  dto.children = n.children.map(toTreeNodeDto);
  return dto;
}
