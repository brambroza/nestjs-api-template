import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Inject } from '@nestjs/common';
import {
  ConvertAmountUseCase,
  CreateCurrencyUseCase,
  GetFxRateUseCase,
  ListCurrenciesUseCase,
  ListFxRatesUseCase,
  SyncFxRatesUseCase,
  UpsertFxRateUseCase,
} from '../application';
import { parseDecimalToScaled } from '../domain';

import {
  ConvertQueryDto,
  ConvertedAmountResponseDto,
  CreateCurrencyRequestDto,
  CurrencyListResponseDto,
  CurrencyResponseDto,
  FxRateListResponseDto,
  FxRateResponseDto,
  GetFxRateQueryDto,
  ListCurrenciesQueryDto,
  ListFxRatesQueryDto,
  SyncFxRatesRequestDto,
  SyncFxRatesResponseDto,
  UpsertFxRateRequestDto,
  toConvertedDto,
  toCurrencyDto,
  toFxRateDto,
  toSyncResultDto,
} from './dto/currency.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('currencies')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CurrencyController {
  constructor(
    private readonly listCurrencies: ListCurrenciesUseCase,
    private readonly createCurrency: CreateCurrencyUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Currency'))
  async list(
    @Query() q: ListCurrenciesQueryDto,
  ): Promise<CurrencyListResponseDto> {
    const dto = new CurrencyListResponseDto();
    dto.items = (
      await this.listCurrencies.execute({ activeOnly: q.activeOnly })
    ).map(toCurrencyDto);
    return dto;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Currency'))
  async create(
    @Body() body: CreateCurrencyRequestDto,
  ): Promise<CurrencyResponseDto> {
    return toCurrencyDto(
      await this.createCurrency.execute({
        code: body.code,
        name: body.name,
        minorUnits: body.minorUnits,
      }),
    );
  }
}

@ApiTags('finance')
@ApiBearerAuth()
@Controller('fx-rates')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class FxRateController {
  constructor(
    private readonly getRate: GetFxRateUseCase,
    private readonly listRates: ListFxRatesUseCase,
    private readonly upsertRate: UpsertFxRateUseCase,
    private readonly syncRates: SyncFxRatesUseCase,
    private readonly convert: ConvertAmountUseCase,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  @Get('latest')
  @ApiOperation({
    summary: 'Most recent rate on or before rateDate (default today)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'FxRate'))
  async latest(@Query() q: GetFxRateQueryDto): Promise<FxRateResponseDto> {
    return toFxRateDto(
      await this.getRate.execute({
        baseCurrency: q.baseCurrency ?? null,
        quoteCurrency: q.quoteCurrency,
        rateDate: q.rateDate ?? null,
      }),
    );
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'FxRate'))
  async list(@Query() q: ListFxRatesQueryDto): Promise<FxRateListResponseDto> {
    const dto = new FxRateListResponseDto();
    dto.items = (
      await this.listRates.execute({
        baseCurrency: q.baseCurrency ?? null,
        quoteCurrency: q.quoteCurrency ?? null,
        from: q.from,
        to: q.to,
      })
    ).map(toFxRateDto);
    return dto;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Manual rate; outranks the BOT feed for that day' })
  @CheckPolicies((ability) => ability.can(Action.Create, 'FxRate'))
  async upsert(
    @Body() body: UpsertFxRateRequestDto,
  ): Promise<FxRateResponseDto> {
    return toFxRateDto(
      await this.upsertRate.execute({
        baseCurrency: body.baseCurrency ?? null,
        quoteCurrency: body.quoteCurrency,
        rateDate: body.rateDate,
        rateScaled: parseDecimalToScaled(body.rate),
      }),
    );
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pull the BOT fixing for this tenant now (default today)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'FxRate'))
  async sync(
    @Body() body: SyncFxRatesRequestDto,
  ): Promise<SyncFxRatesResponseDto> {
    return toSyncResultDto(
      await this.syncRates.execute({
        rateDate: body.rateDate ?? null,
        tenantIds: [this.tenant.getTenantId()],
      }),
    );
  }

  @Get('convert')
  @CheckPolicies((ability) => ability.can(Action.Read, 'FxRate'))
  async convertEndpoint(
    @Query() q: ConvertQueryDto,
  ): Promise<ConvertedAmountResponseDto> {
    return toConvertedDto(
      await this.convert.execute({
        amountMinor: BigInt(q.amountMinor),
        fromCurrency: q.fromCurrency,
        toCurrency: q.toCurrency,
        rateDate: q.rateDate ?? null,
      }),
    );
  }
}
