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
  CancelPurchaseOrderUseCase,
  ConfirmPurchaseOrderUseCase,
  CreateGoodsReceiptUseCase,
  CreatePurchaseOrderUseCase,
  GetPurchaseOrderUseCase,
  ListGoodsReceiptsForOrderUseCase,
  ListPurchaseOrdersUseCase,
  ReopenPurchaseOrderUseCase,
  SubmitPurchaseOrderUseCase,
  UpdatePurchaseOrderUseCase,
} from '../application';

import {
  CreateGoodsReceiptRequestDto,
  CreatePurchaseOrderRequestDto,
  DocumentActionRequestDto,
  GoodsReceiptListResponseDto,
  GoodsReceiptResponseDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderListResponseDto,
  PurchaseOrderResponseDto,
  UpdatePurchaseOrderRequestDto,
  toGoodsReceiptDto,
  toPurchaseLineRequest,
  toPurchaseOrderDto,
} from './dto/procurement.dto';

@ApiTags('purchase')
@ApiBearerAuth()
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PurchaseOrderController {
  constructor(
    private readonly createPo: CreatePurchaseOrderUseCase,
    private readonly updatePo: UpdatePurchaseOrderUseCase,
    private readonly submitPo: SubmitPurchaseOrderUseCase,
    private readonly confirmPo: ConfirmPurchaseOrderUseCase,
    private readonly reopenPo: ReopenPurchaseOrderUseCase,
    private readonly cancelPo: CancelPurchaseOrderUseCase,
    private readonly getPo: GetPurchaseOrderUseCase,
    private readonly listPo: ListPurchaseOrdersUseCase,
    private readonly createGrn: CreateGoodsReceiptUseCase,
    private readonly listGrn: ListGoodsReceiptsForOrderUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'PurchaseOrder'))
  async list(
    @Query() q: ListPurchaseOrdersQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    const r = await this.listPo.execute({
      limit: q.limit,
      offset: q.offset,
      status: q.status ?? null,
      vendorId: q.vendorId ?? null,
    });
    const dto = new PurchaseOrderListResponseDto();
    dto.items = r.items.map(toPurchaseOrderDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PurchaseOrder'))
  async find(@Param('id') id: string): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(await this.getPo.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a DRAFT PO directly or from an APPROVED requisition',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'PurchaseOrder'))
  async create(
    @Body() body: CreatePurchaseOrderRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.createPo.execute({
        requisitionId: body.requisitionId ?? null,
        companyId: body.companyId ?? null,
        vendorId: body.vendorId,
        currency: body.currency ?? null,
        orderDate: body.orderDate ?? null,
        expectedDate: body.expectedDate ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        notes: body.notes ?? null,
        lines: body.lines ? body.lines.map(toPurchaseLineRequest) : null,
      }),
    );
  }

  @Put(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseOrder'))
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePurchaseOrderRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.updatePo.execute({
        purchaseOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
        expectedDate: body.expectedDate,
        paymentTermsDays: body.paymentTermsDays,
        notes: body.notes,
        lines: body.lines ? body.lines.map(toPurchaseLineRequest) : null,
      }),
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'PURCHASE_ORDER approval matrix; ISSUED at once when no step applies',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'PurchaseOrder'))
  async submit(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.submitPo.execute({
        purchaseOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseOrder'))
  async confirm(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.confirmPo.execute({
        purchaseOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseOrder'))
  async reopen(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.reopenPo.execute({
        purchaseOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'PurchaseOrder'))
  async cancel(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderDto(
      await this.cancelPo.execute({
        purchaseOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }

  @Get(':id/goods-receipts')
  @CheckPolicies((ability) => ability.can(Action.Read, 'GoodsReceipt'))
  async goodsReceipts(
    @Param('id') id: string,
  ): Promise<GoodsReceiptListResponseDto> {
    const dto = new GoodsReceiptListResponseDto();
    dto.items = (await this.listGrn.execute(id)).map(toGoodsReceiptDto);
    return dto;
  }

  @Post(':id/goods-receipts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Draft a goods receipt (lot/expiry captured for LOT items)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'GoodsReceipt'))
  async createGoodsReceipt(
    @Param('id') id: string,
    @Body() body: CreateGoodsReceiptRequestDto,
  ): Promise<GoodsReceiptResponseDto> {
    return toGoodsReceiptDto(
      await this.createGrn.execute({
        purchaseOrderId: id,
        warehouseId: body.warehouseId,
        receiptDate: body.receiptDate ?? null,
        vendorDeliveryRef: body.vendorDeliveryRef ?? null,
        notes: body.notes ?? null,
        lines: body.lines
          ? body.lines.map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId,
              quantity: BigInt(l.quantity),
              lotNumber: l.lotNumber ?? null,
              expiryDate: l.expiryDate ?? null,
            }))
          : null,
      }),
    );
  }
}
