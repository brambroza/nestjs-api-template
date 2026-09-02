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

import { JwtAuthGuard } from '../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../shared/auth/policies';
import {
  CancelTransferUseCase,
  CreateTransferUseCase,
  GetTransferUseCase,
  ListTransfersUseCase,
  ReceiveTransferUseCase,
  ShipTransferUseCase,
} from '../application';

import {
  CreateTransferRequestDto,
  ListTransfersQueryDto,
  TransferActionRequestDto,
  TransferListResponseDto,
  TransferResponseDto,
  toTransferDto,
} from './dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/transfers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TransferController {
  constructor(
    private readonly createTransfer: CreateTransferUseCase,
    private readonly shipTransfer: ShipTransferUseCase,
    private readonly receiveTransfer: ReceiveTransferUseCase,
    private readonly cancelTransfer: CancelTransferUseCase,
    private readonly getTransfer: GetTransferUseCase,
    private readonly listTransfers: ListTransfersUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockTransfer'))
  async list(
    @Query() q: ListTransfersQueryDto,
  ): Promise<TransferListResponseDto> {
    const r = await this.listTransfers.execute({
      status: q.status ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new TransferListResponseDto();
    dto.items = r.items.map(toTransferDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockTransfer'))
  async find(@Param('id') id: string): Promise<TransferResponseDto> {
    return toTransferDto(await this.getTransfer.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockTransfer'))
  async create(
    @Body() body: CreateTransferRequestDto,
  ): Promise<TransferResponseDto> {
    return toTransferDto(
      await this.createTransfer.execute({
        fromWarehouseId: body.fromWarehouseId,
        toWarehouseId: body.toWarehouseId,
        notes: body.notes ?? null,
        lines: body.lines.map((l) => ({
          itemId: l.itemId,
          quantity: BigInt(l.quantity),
          lotNumber: l.lotNumber ?? null,
          serialNumbers: l.serialNumbers ?? null,
        })),
      }),
    );
  }

  @Post(':id/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'TRANSFER_OUT at the source; stock is in transit on the document',
  })
  @CheckPolicies((ability) => ability.can(Action.Release, 'StockTransfer'))
  async ship(
    @Param('id') id: string,
    @Body() body: TransferActionRequestDto,
  ): Promise<TransferResponseDto> {
    return toTransferDto(
      await this.shipTransfer.execute({
        transferId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'TRANSFER_IN at the destination at the carried cost',
  })
  @CheckPolicies((ability) => ability.can(Action.Release, 'StockTransfer'))
  async receive(
    @Param('id') id: string,
    @Body() body: TransferActionRequestDto,
  ): Promise<TransferResponseDto> {
    return toTransferDto(
      await this.receiveTransfer.execute({
        transferId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'StockTransfer'))
  async cancel(
    @Param('id') id: string,
    @Body() body: TransferActionRequestDto,
  ): Promise<TransferResponseDto> {
    return toTransferDto(
      await this.cancelTransfer.execute({
        transferId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}
