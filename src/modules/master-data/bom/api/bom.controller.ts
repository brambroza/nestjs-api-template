import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  ActivateBomUseCase,
  CreateBomUseCase,
  GetBomUseCase,
  ListBomsForItemUseCase,
} from '../application';

import {
  BomListResponseDto,
  BomResponseDto,
  CreateBomRequestDto,
  toBomResponseDto,
} from './dto/bom.dto';

const big = (v: string | undefined): bigint | undefined =>
  v === undefined ? undefined : BigInt(v);

@ApiTags('boms')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BomController {
  constructor(
    private readonly createBom: CreateBomUseCase,
    private readonly activateBom: ActivateBomUseCase,
    private readonly getBom: GetBomUseCase,
    private readonly listForItem: ListBomsForItemUseCase,
  ) {}

  @Get('items/:itemId/boms')
  @ApiOperation({
    summary: 'All BOM versions for a product item, newest first',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'Bom'))
  async list(@Param('itemId') itemId: string): Promise<BomListResponseDto> {
    const boms = await this.listForItem.execute(itemId);
    const dto = new BomListResponseDto();
    dto.items = boms.map(toBomResponseDto);
    return dto;
  }

  @Post('items/:itemId/boms')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a new (inactive) BOM version; components are immutable per version',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'Bom'))
  async create(
    @Param('itemId') itemId: string,
    @Body() body: CreateBomRequestDto,
  ): Promise<BomResponseDto> {
    const bom = await this.createBom.execute({
      itemId,
      version: body.version ?? null,
      name: body.name ?? null,
      components: body.components.map((c) => ({
        componentItemId: c.componentItemId,
        qtyPerUnit: BigInt(c.qtyPerUnit),
        qtyPerUnitUom: c.qtyPerUnitUom ?? null,
        scrapBasisPoints: big(c.scrapBasisPoints),
        yieldBasisPoints: big(c.yieldBasisPoints),
        minPack: big(c.minPack),
        minPackUom: c.minPackUom ?? null,
      })),
    });
    return toBomResponseDto(bom);
  }

  @Get('boms/:id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Bom'))
  async find(@Param('id') id: string): Promise<BomResponseDto> {
    return toBomResponseDto(await this.getBom.execute(id));
  }

  @Post('boms/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Make this the active version (deactivates the current one atomically)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'Bom'))
  async activate(@Param('id') id: string): Promise<BomResponseDto> {
    return toBomResponseDto(await this.activateBom.execute(id));
  }
}
