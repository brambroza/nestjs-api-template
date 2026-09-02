import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  CreateTaxCodeUseCase,
  ListTaxCodesUseCase,
  ResolveTaxUseCase,
  SetItemTaxOverrideUseCase,
} from '../application';

import {
  CreateTaxCodeRequestDto,
  ItemTaxOverrideResponseDto,
  ListTaxCodesQueryDto,
  ResolveTaxQueryDto,
  ResolvedTaxResponseDto,
  SetItemTaxOverrideRequestDto,
  TaxCodeListResponseDto,
  TaxCodeResponseDto,
  toOverrideDto,
  toResolvedTaxDto,
  toTaxCodeDto,
} from './dto/tax.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TaxController {
  constructor(
    private readonly listCodes: ListTaxCodesUseCase,
    private readonly createCode: CreateTaxCodeUseCase,
    private readonly setOverride: SetItemTaxOverrideUseCase,
    private readonly resolve: ResolveTaxUseCase,
  ) {}

  @Get('tax-codes')
  @CheckPolicies((ability) => ability.can(Action.Read, 'TaxCode'))
  async list(
    @Query() q: ListTaxCodesQueryDto,
  ): Promise<TaxCodeListResponseDto> {
    const dto = new TaxCodeListResponseDto();
    dto.items = (
      await this.listCodes.execute({
        kind: q.kind ?? null,
        activeOnly: q.activeOnly,
      })
    ).map(toTaxCodeDto);
    return dto;
  }

  /** Declared before any `:id` style route on this prefix. */
  @Get('tax-codes/resolve')
  @ApiOperation({
    summary:
      'Applicable VAT/WHT code for an item (override > default), optionally with the computed amount',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'TaxCode'))
  async resolveEndpoint(
    @Query() q: ResolveTaxQueryDto,
  ): Promise<ResolvedTaxResponseDto> {
    return toResolvedTaxDto(
      await this.resolve.execute({
        kind: q.kind,
        itemId: q.itemId ?? null,
        baseAmountMinor:
          q.baseAmountMinor !== undefined ? BigInt(q.baseAmountMinor) : null,
      }),
    );
  }

  @Post('tax-codes')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'TaxCode'))
  async create(
    @Body() body: CreateTaxCodeRequestDto,
  ): Promise<TaxCodeResponseDto> {
    return toTaxCodeDto(
      await this.createCode.execute({
        code: body.code,
        name: body.name,
        kind: body.kind,
        rateBasisPoints: BigInt(body.rateBasisPoints),
        vatTreatment: body.vatTreatment ?? null,
        pndForm: body.pndForm ?? null,
        whtIncomeType: body.whtIncomeType ?? null,
        isDefault: body.isDefault ?? false,
      }),
    );
  }

  @Put('items/:itemId/tax-override')
  @ApiOperation({
    summary:
      'Make an item exempt / zero-rated / special-WHT by pinning a tax code to it',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'TaxCode'))
  async override(
    @Param('itemId') itemId: string,
    @Body() body: SetItemTaxOverrideRequestDto,
  ): Promise<ItemTaxOverrideResponseDto> {
    return toOverrideDto(
      await this.setOverride.execute({
        itemId,
        kind: body.kind,
        taxCodeId: body.taxCodeId,
        reason: body.reason ?? null,
      }),
    );
  }
}
