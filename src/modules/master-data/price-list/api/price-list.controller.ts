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
  AddPriceListLineUseCase,
  CreatePriceListUseCase,
  GetPriceListUseCase,
  ListPriceListsUseCase,
  ResolvePriceUseCase,
} from '../application';

import {
  AddPriceListLineRequestDto,
  CreatePriceListRequestDto,
  ListPriceListsQueryDto,
  ListPriceListsResponseDto,
  PriceListDetailResponseDto,
  PriceListLineResponseDto,
  PriceListResponseDto,
  ResolvePriceQueryDto,
  ResolvedPriceResponseDto,
  toPriceListDetailResponseDto,
  toPriceListLineResponseDto,
  toPriceListResponseDto,
  toResolvedPriceResponseDto,
} from './dto/price-list.dto';

@ApiTags('price-lists')
@ApiBearerAuth()
@Controller('price-lists')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PriceListController {
  constructor(
    private readonly createList: CreatePriceListUseCase,
    private readonly addLine: AddPriceListLineUseCase,
    private readonly getList: GetPriceListUseCase,
    private readonly listLists: ListPriceListsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'PriceList'))
  async list(
    @Query() query: ListPriceListsQueryDto,
  ): Promise<ListPriceListsResponseDto> {
    const result = await this.listLists.execute({
      limit: query.limit,
      offset: query.offset,
      customerId: query.customerId,
      activeOnly: query.activeOnly,
    });
    const dto = new ListPriceListsResponseDto();
    dto.items = result.items.map(toPriceListResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PriceList'))
  async find(@Param('id') id: string): Promise<PriceListDetailResponseDto> {
    const { list, lines } = await this.getList.execute(id);
    return toPriceListDetailResponseDto(list, lines);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'PriceList'))
  async create(
    @Body() body: CreatePriceListRequestDto,
  ): Promise<PriceListResponseDto> {
    const list = await this.createList.execute({
      code: body.code,
      name: body.name,
      currency: body.currency,
      customerId: body.customerId ?? null,
      validFrom: new Date(body.validFrom),
      validTo: body.validTo ? new Date(body.validTo) : null,
    });
    return toPriceListResponseDto(list);
  }

  @Post(':id/lines')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'PriceList'))
  async addLineEndpoint(
    @Param('id') id: string,
    @Body() body: AddPriceListLineRequestDto,
  ): Promise<PriceListLineResponseDto> {
    const line = await this.addLine.execute({
      priceListId: id,
      itemId: body.itemId,
      uomCode: body.uomCode ?? null,
      minQty: body.minQty !== undefined ? BigInt(body.minQty) : undefined,
      unitPriceSatang: BigInt(body.unitPriceSatang),
    });
    return toPriceListLineResponseDto(line);
  }
}

@ApiTags('price-lists')
@ApiBearerAuth()
@Controller('prices')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PriceResolveController {
  constructor(private readonly resolve: ResolvePriceUseCase) {}

  @Get('resolve')
  @ApiOperation({
    summary:
      'Applicable unit price for item/customer/date/quantity (customer list > general, highest tier reached, newest validFrom)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'PriceList'))
  async resolveEndpoint(
    @Query() query: ResolvePriceQueryDto,
  ): Promise<ResolvedPriceResponseDto> {
    const price = await this.resolve.execute({
      itemId: query.itemId,
      customerId: query.customerId ?? null,
      date: query.date ? new Date(query.date) : null,
      quantity:
        query.quantity !== undefined ? BigInt(query.quantity) : undefined,
      uomCode: query.uomCode ?? null,
    });
    return toResolvedPriceResponseDto(price);
  }
}
