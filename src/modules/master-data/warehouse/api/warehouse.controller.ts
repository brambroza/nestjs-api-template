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
  CreateWarehouseUseCase,
  GetWarehouseUseCase,
  ListWarehousesUseCase,
} from '../application';

import {
  CreateWarehouseRequestDto,
  ListWarehousesQueryDto,
  ListWarehousesResponseDto,
  WarehouseResponseDto,
  toWarehouseResponseDto,
} from './dto';

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class WarehouseController {
  constructor(
    private readonly createWarehouse: CreateWarehouseUseCase,
    private readonly getWarehouse: GetWarehouseUseCase,
    private readonly listWarehouses: ListWarehousesUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Warehouse'))
  async list(
    @Query() query: ListWarehousesQueryDto,
  ): Promise<ListWarehousesResponseDto> {
    const result = await this.listWarehouses.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
      branchId: query.branchId ?? null,
    });
    const dto = new ListWarehousesResponseDto();
    dto.items = result.items.map(toWarehouseResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Warehouse'))
  async find(@Param('id') id: string): Promise<WarehouseResponseDto> {
    return toWarehouseResponseDto(await this.getWarehouse.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Warehouse'))
  async create(
    @Body() body: CreateWarehouseRequestDto,
  ): Promise<WarehouseResponseDto> {
    const warehouse = await this.createWarehouse.execute({
      branchId: body.branchId,
      code: body.code,
      name: body.name,
      isDefault: body.isDefault,
    });
    return toWarehouseResponseDto(warehouse);
  }
}
