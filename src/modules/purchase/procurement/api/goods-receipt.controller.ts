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
  CancelGoodsReceiptUseCase,
  GetGoodsReceiptUseCase,
  PostGoodsReceiptUseCase,
} from '../application';

import {
  DocumentActionRequestDto,
  GoodsReceiptResponseDto,
  toGoodsReceiptDto,
} from './dto/procurement.dto';

@ApiTags('purchase')
@ApiBearerAuth()
@Controller('goods-receipts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class GoodsReceiptController {
  constructor(
    private readonly getGrn: GetGoodsReceiptUseCase,
    private readonly postGrn: PostGoodsReceiptUseCase,
    private readonly cancelGrn: CancelGoodsReceiptUseCase,
  ) {}

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'GoodsReceipt'))
  async find(@Param('id') id: string): Promise<GoodsReceiptResponseDto> {
    return toGoodsReceiptDto(await this.getGrn.execute(id));
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Post: received quantities land on the PO in the same transaction',
  })
  @CheckPolicies((ability) => ability.can(Action.Release, 'GoodsReceipt'))
  async post(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<GoodsReceiptResponseDto> {
    return toGoodsReceiptDto(
      await this.postGrn.execute({
        goodsReceiptId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'GoodsReceipt'))
  async cancel(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<GoodsReceiptResponseDto> {
    return toGoodsReceiptDto(
      await this.cancelGrn.execute({
        goodsReceiptId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}
