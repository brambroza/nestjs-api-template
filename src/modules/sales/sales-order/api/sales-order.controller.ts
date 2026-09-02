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
  CancelSalesOrderUseCase,
  ConfirmSalesOrderUseCase,
  CreateDeliveryNoteUseCase,
  CreateSalesOrderUseCase,
  GetSalesOrderUseCase,
  ListDeliveryNotesForOrderUseCase,
  ListSalesOrdersUseCase,
  ReopenSalesOrderUseCase,
  SubmitSalesOrderUseCase,
  UpdateSalesOrderUseCase,
} from '../application';

import {
  CreateDeliveryNoteRequestDto,
  CreateSalesOrderRequestDto,
  DeliveryNoteListResponseDto,
  DeliveryNoteResponseDto,
  ListSalesOrdersQueryDto,
  OrderActionRequestDto,
  SalesOrderListResponseDto,
  SalesOrderResponseDto,
  UpdateSalesOrderRequestDto,
  toDeliveryNoteDto,
  toLineRequest,
  toSalesOrderDto,
} from './dto/sales-order.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales-orders')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SalesOrderController {
  constructor(
    private readonly createOrder: CreateSalesOrderUseCase,
    private readonly updateOrder: UpdateSalesOrderUseCase,
    private readonly submitOrder: SubmitSalesOrderUseCase,
    private readonly confirmOrder: ConfirmSalesOrderUseCase,
    private readonly reopenOrder: ReopenSalesOrderUseCase,
    private readonly cancelOrder: CancelSalesOrderUseCase,
    private readonly getOrder: GetSalesOrderUseCase,
    private readonly listOrders: ListSalesOrdersUseCase,
    private readonly createNote: CreateDeliveryNoteUseCase,
    private readonly listNotes: ListDeliveryNotesForOrderUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesOrder'))
  async list(
    @Query() q: ListSalesOrdersQueryDto,
  ): Promise<SalesOrderListResponseDto> {
    const result = await this.listOrders.execute({
      limit: q.limit,
      offset: q.offset,
      status: q.status ?? null,
      customerId: q.customerId ?? null,
    });
    const dto = new SalesOrderListResponseDto();
    dto.items = result.items.map(toSalesOrderDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesOrder'))
  async find(@Param('id') id: string): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(await this.getOrder.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a DRAFT order directly or by converting an ACCEPTED quotation',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'SalesOrder'))
  async create(
    @Body() body: CreateSalesOrderRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.createOrder.execute({
        quotationId: body.quotationId ?? null,
        companyId: body.companyId ?? null,
        customerId: body.customerId ?? null,
        currency: body.currency ?? null,
        orderDate: body.orderDate ?? null,
        requestedDeliveryDate: body.requestedDeliveryDate ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        notes: body.notes ?? null,
        lines: body.lines ? body.lines.map(toLineRequest) : null,
      }),
    );
  }

  @Put(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, 'SalesOrder'))
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSalesOrderRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.updateOrder.execute({
        salesOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
        requestedDeliveryDate: body.requestedDeliveryDate,
        paymentTermsDays: body.paymentTermsDays,
        notes: body.notes,
        lines: body.lines ? body.lines.map(toLineRequest) : null,
      }),
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Credit check + approval matrix; CONFIRMED at once when no step applies',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'SalesOrder'))
  async submit(
    @Param('id') id: string,
    @Body() body: OrderActionRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.submitOrder.execute({
        salesOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply the approval outcome to a PENDING_APPROVAL order',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'SalesOrder'))
  async confirm(
    @Param('id') id: string,
    @Body() body: OrderActionRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.confirmOrder.execute({
        salesOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'REJECTED -> DRAFT for rework' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'SalesOrder'))
  async reopen(
    @Param('id') id: string,
    @Body() body: OrderActionRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.reopenOrder.execute({
        salesOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'SalesOrder'))
  async cancel(
    @Param('id') id: string,
    @Body() body: OrderActionRequestDto,
  ): Promise<SalesOrderResponseDto> {
    return toSalesOrderDto(
      await this.cancelOrder.execute({
        salesOrderId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }

  @Get(':id/delivery-notes')
  @CheckPolicies((ability) => ability.can(Action.Read, 'DeliveryNote'))
  async deliveryNotes(
    @Param('id') id: string,
  ): Promise<DeliveryNoteListResponseDto> {
    const dto = new DeliveryNoteListResponseDto();
    dto.items = (await this.listNotes.execute(id)).map(toDeliveryNoteDto);
    return dto;
  }

  @Post(':id/delivery-notes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Draft a delivery note (partial or everything outstanding)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'DeliveryNote'))
  async createDeliveryNote(
    @Param('id') id: string,
    @Body() body: CreateDeliveryNoteRequestDto,
  ): Promise<DeliveryNoteResponseDto> {
    return toDeliveryNoteDto(
      await this.createNote.execute({
        salesOrderId: id,
        deliveryDate: body.deliveryDate ?? null,
        warehouseId: body.warehouseId ?? null,
        shipToAddress: body.shipToAddress ?? null,
        notes: body.notes ?? null,
        lines: body.lines
          ? body.lines.map((l) => ({
              salesOrderLineId: l.salesOrderLineId,
              quantity: BigInt(l.quantity),
            }))
          : null,
      }),
    );
  }
}
