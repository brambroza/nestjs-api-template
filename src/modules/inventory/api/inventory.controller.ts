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
  AdjustStockUseCase,
  FindSerialUseCase,
  GetItemStockUseCase,
  IssueStockUseCase,
  ListLotsUseCase,
  ListMovementsUseCase,
  ListWarehouseStockUseCase,
  ReceiveStockUseCase,
  ReleaseReservationUseCase,
  ReserveStockUseCase,
} from '../application';

import {
  AdjustmentRequestDto,
  BalanceListResponseDto,
  ItemStockResponseDto,
  ListMovementsQueryDto,
  LotListResponseDto,
  LotsQueryDto,
  ManualMovementRequestDto,
  MovementListResponseDto,
  ReleaseRequestDto,
  ReleaseResponseDto,
  ReserveRequestDto,
  ReserveResponseDto,
  SerialListResponseDto,
  WarehouseStockQueryDto,
  toBalanceDto,
  toItemStockDto,
  toLineCommand,
  toLotDto,
  toMovementDto,
  toSerialDto,
} from './dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class InventoryController {
  constructor(
    private readonly receiveStock: ReceiveStockUseCase,
    private readonly issueStock: IssueStockUseCase,
    private readonly adjustStock: AdjustStockUseCase,
    private readonly reserveStock: ReserveStockUseCase,
    private readonly releaseReservation: ReleaseReservationUseCase,
    private readonly getItemStock: GetItemStockUseCase,
    private readonly listWarehouseStock: ListWarehouseStockUseCase,
    private readonly listMovements: ListMovementsUseCase,
    private readonly listLots: ListLotsUseCase,
    private readonly findSerial: FindSerialUseCase,
  ) {}

  @Post('receipts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Manual receipt (opening stock, returns)' })
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockMovement'))
  async receive(
    @Body() body: ManualMovementRequestDto,
  ): Promise<MovementListResponseDto> {
    const items = await this.receiveStock.execute({
      ...body,
      lines: body.lines.map(toLineCommand),
    });
    return this.page(items);
  }

  @Post('issues')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Manual issue (consumption, scrap)' })
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockMovement'))
  async issue(
    @Body() body: ManualMovementRequestDto,
  ): Promise<MovementListResponseDto> {
    const items = await this.issueStock.execute({
      ...body,
      lines: body.lines.map(toLineCommand),
    });
    return this.page(items);
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adjustment with a mandatory reason' })
  @CheckPolicies((ability) => ability.can(Action.Approve, 'StockMovement'))
  async adjust(
    @Body() body: AdjustmentRequestDto,
  ): Promise<MovementListResponseDto> {
    const items = await this.adjustStock.execute({
      ...body,
      lines: body.lines.map(toLineCommand),
    });
    return this.page(items);
  }

  @Post('reservations')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockMovement'))
  async reserve(@Body() body: ReserveRequestDto): Promise<ReserveResponseDto> {
    const r = await this.reserveStock.execute({
      ...body,
      lines: body.lines.map(toLineCommand),
    });
    const dto = new ReserveResponseDto();
    dto.kind = r.kind;
    dto.warehouseId = r.warehouseId;
    dto.shortages =
      r.kind === 'shortage'
        ? r.shortages.map((s) => ({
            ...s,
            requiredQty: s.requiredQty.toString(),
            availableQty: s.availableQty.toString(),
          }))
        : [];
    return dto;
  }

  @Post('reservations/release')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockMovement'))
  async release(@Body() body: ReleaseRequestDto): Promise<ReleaseResponseDto> {
    const dto = new ReleaseResponseDto();
    dto.released = await this.releaseReservation.execute(
      body.referenceType,
      body.referenceId,
    );
    return dto;
  }

  @Get('stock/items/:itemId')
  @ApiOperation({
    summary: 'Real-time stock of one item across warehouses and lots (T-327)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockMovement'))
  async itemStock(
    @Param('itemId') itemId: string,
  ): Promise<ItemStockResponseDto> {
    return toItemStockDto(await this.getItemStock.execute(itemId));
  }

  @Get('stock/warehouses/:warehouseId')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockMovement'))
  async warehouseStock(
    @Param('warehouseId') warehouseId: string,
    @Query() q: WarehouseStockQueryDto,
  ): Promise<BalanceListResponseDto> {
    const r = await this.listWarehouseStock.execute({
      warehouseId,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new BalanceListResponseDto();
    dto.items = r.items.map(toBalanceDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get('movements')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockMovement'))
  async movements(
    @Query() q: ListMovementsQueryDto,
  ): Promise<MovementListResponseDto> {
    const r = await this.listMovements.execute({
      itemId: q.itemId ?? null,
      warehouseId: q.warehouseId ?? null,
      referenceType: q.referenceType?.toUpperCase() ?? null,
      referenceId: q.referenceId ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new MovementListResponseDto();
    dto.items = r.items.map(toMovementDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get('lots/items/:itemId')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockMovement'))
  async lots(
    @Param('itemId') itemId: string,
    @Query() q: LotsQueryDto,
  ): Promise<LotListResponseDto> {
    const dto = new LotListResponseDto();
    dto.items = (
      await this.listLots.execute({
        itemId,
        expiringWithinDays: q.expiringWithinDays ?? null,
      })
    ).map(toLotDto);
    return dto;
  }

  @Get('serials/:serialNumber')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockMovement'))
  async serial(
    @Param('serialNumber') serialNumber: string,
  ): Promise<SerialListResponseDto> {
    const dto = new SerialListResponseDto();
    dto.items = (await this.findSerial.execute(serialNumber)).map(toSerialDto);
    return dto;
  }

  private page(
    items: readonly Parameters<typeof toMovementDto>[0][],
  ): MovementListResponseDto {
    const dto = new MovementListResponseDto();
    dto.items = items.map(toMovementDto);
    dto.total = items.length;
    dto.limit = items.length;
    dto.offset = 0;
    return dto;
  }
}
