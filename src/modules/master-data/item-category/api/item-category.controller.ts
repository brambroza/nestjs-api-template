import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CreateItemCategoryUseCase,
  GetItemCategoryUseCase,
  ListItemCategoryTreeUseCase,
} from '../application';

import {
  CreateItemCategoryRequestDto,
  ItemCategoryResponseDto,
  ItemCategoryTreeResponseDto,
  ListItemCategoriesQueryDto,
  toItemCategoryResponseDto,
  toTreeNodeDto,
} from './dto/item-category.dto';

@ApiTags('item-categories')
@ApiBearerAuth()
@Controller('item-categories')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ItemCategoryController {
  constructor(
    private readonly createCategory: CreateItemCategoryUseCase,
    private readonly getCategory: GetItemCategoryUseCase,
    private readonly listTree: ListItemCategoryTreeUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Whole category tree for the tenant' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'ItemCategory'))
  async tree(
    @Query() query: ListItemCategoriesQueryDto,
  ): Promise<ItemCategoryTreeResponseDto> {
    const roots = await this.listTree.execute({ activeOnly: query.activeOnly });
    const dto = new ItemCategoryTreeResponseDto();
    dto.roots = roots.map(toTreeNodeDto);
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'ItemCategory'))
  async find(@Param('id') id: string): Promise<ItemCategoryResponseDto> {
    return toItemCategoryResponseDto(await this.getCategory.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'ItemCategory'))
  async create(
    @Body() body: CreateItemCategoryRequestDto,
  ): Promise<ItemCategoryResponseDto> {
    const category = await this.createCategory.execute({
      code: body.code,
      name: body.name,
      parentId: body.parentId ?? null,
    });
    return toItemCategoryResponseDto(category);
  }
}
