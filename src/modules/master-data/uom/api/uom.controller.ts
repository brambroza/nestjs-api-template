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
  CreateUomUseCase,
  GetUomUseCase,
  ListUomsUseCase,
} from '../application';

import {
  CreateUomRequestDto,
  ListUomsQueryDto,
  ListUomsResponseDto,
  UomResponseDto,
  toUomResponseDto,
} from './dto';

@ApiTags('uoms')
@ApiBearerAuth()
@Controller('uoms')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class UomController {
  constructor(
    private readonly createUom: CreateUomUseCase,
    private readonly getUom: GetUomUseCase,
    private readonly listUoms: ListUomsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Uom'))
  async list(@Query() query: ListUomsQueryDto): Promise<ListUomsResponseDto> {
    const result = await this.listUoms.execute({
      limit: query.limit,
      offset: query.offset,
    });
    const dto = new ListUomsResponseDto();
    dto.items = result.items.map(toUomResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Uom'))
  async find(@Param('id') id: string): Promise<UomResponseDto> {
    return toUomResponseDto(await this.getUom.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Uom'))
  async create(@Body() body: CreateUomRequestDto): Promise<UomResponseDto> {
    const uom = await this.createUom.execute({
      code: body.code,
      name: body.name,
      baseUomCode: body.baseUomCode ?? null,
      conversionRatio:
        body.conversionRatio !== undefined
          ? BigInt(body.conversionRatio)
          : undefined,
    });
    return toUomResponseDto(uom);
  }
}
