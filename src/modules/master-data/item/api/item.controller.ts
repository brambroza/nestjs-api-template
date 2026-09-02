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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ListItemsUseCase,
} from '../application';

import {
  CreateItemRequestDto,
  ItemResponseDto,
  ListItemsQueryDto,
  ListItemsResponseDto,
  toItemResponseDto,
} from './dto';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ItemController {
  constructor(
    private readonly createItem: CreateItemUseCase,
    private readonly getItem: GetItemUseCase,
    private readonly listItems: ListItemsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Item'))
  async list(@Query() query: ListItemsQueryDto): Promise<ListItemsResponseDto> {
    const result = await this.listItems.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
    });
    const dto = new ListItemsResponseDto();
    dto.items = result.items.map(toItemResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Item'))
  async find(@Param('id') id: string): Promise<ItemResponseDto> {
    return toItemResponseDto(await this.getItem.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Item'))
  async create(@Body() body: CreateItemRequestDto): Promise<ItemResponseDto> {
    const item = await this.createItem.execute({
      sku: body.sku,
      name: body.name,
      description: body.description ?? null,
      defaultUomCode: body.defaultUomCode,
    });
    return toItemResponseDto(item);
  }
}
