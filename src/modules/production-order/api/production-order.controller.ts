import { randomUUID } from 'node:crypto';

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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../shared/auth/policies';
import { Money, OrderId, Quantity, Sku } from '../domain';
import {
  ApproveOrderUseCase,
  CancelOrderUseCase,
  CreateDraftOrderUseCase,
  GetOrderUseCase,
  ReleaseOrderUseCase,
  ReportProgressUseCase,
  SubmitOrderUseCase,
} from '../application/use-cases';

import {
  CancelOrderRequestDto,
  CreateDraftOrderRequestDto,
  ProductionOrderResponseDto,
  ReportProgressRequestDto,
  toResponseDto,
} from './dto';

/**
 * Controller is a thin adapter. Every method:
 *   1. Parses input into typed DTO (ValidationPipe already ran).
 *   2. Converts DTO -> domain value objects at the boundary.
 *   3. Calls exactly one use case.
 *   4. Returns a response DTO built from the aggregate.
 *
 * No business logic. If a change belongs in a use case, it does not
 * belong here.
 */
@ApiTags('production-orders')
@ApiBearerAuth()
@Controller('production-orders')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProductionOrderController {
  constructor(
    private readonly createDraft: CreateDraftOrderUseCase,
    private readonly submit: SubmitOrderUseCase,
    private readonly approve: ApproveOrderUseCase,
    private readonly release: ReleaseOrderUseCase,
    private readonly reportProgress: ReportProgressUseCase,
    private readonly cancel: CancelOrderUseCase,
    private readonly getOne: GetOrderUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'ProductionOrder'))
  async create(
    @Body() body: CreateDraftOrderRequestDto,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(body.orderId ?? randomUUID());
    await this.createDraft.execute({
      orderId,
      productSku: body.productSku ? Sku.of(body.productSku) : null,
      orderedQuantity: Quantity.of(
        BigInt(body.orderedQuantity.value),
        body.orderedQuantity.uom,
      ),
      totalAmount: Money.of(
        BigInt(body.totalAmount.amount),
        body.totalAmount.currency,
      ),
    });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'ProductionOrder'))
  async find(@Param('id') id: string): Promise<ProductionOrderResponseDto> {
    const order = await this.getOne.execute(OrderId.of(id));
    return toResponseDto(order);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) =>
    ability.can(Action.Submit, 'ProductionOrderSubmit'),
  )
  async submitEndpoint(
    @Param('id') id: string,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(id);
    await this.submit.execute({ orderId });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) =>
    ability.can(Action.Approve, 'ProductionOrderApprove'),
  )
  async approveEndpoint(
    @Param('id') id: string,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(id);
    await this.approve.execute({ orderId });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) =>
    ability.can(Action.Release, 'ProductionOrderRelease'),
  )
  async releaseEndpoint(
    @Param('id') id: string,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(id);
    await this.release.execute({ orderId });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }

  @Post(':id/progress')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) =>
    ability.can(Action.ReportProgress, 'ProductionOrderReport'),
  )
  async reportProgressEndpoint(
    @Param('id') id: string,
    @Body() body: ReportProgressRequestDto,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(id);
    await this.reportProgress.execute({
      orderId,
      quantity: Quantity.of(BigInt(body.quantity.value), body.quantity.uom),
    });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) =>
    ability.can(Action.Cancel, 'ProductionOrderCancel'),
  )
  async cancelEndpoint(
    @Param('id') id: string,
    @Body() body: CancelOrderRequestDto,
  ): Promise<ProductionOrderResponseDto> {
    const orderId = OrderId.of(id);
    await this.cancel.execute({ orderId, reason: body.reason });
    const order = await this.getOne.execute(orderId);
    return toResponseDto(order);
  }
}
