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
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { JwtAuthGuard } from '../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../shared/auth/policies';
import {
  CancelCountUseCase,
  CreateCountSheetUseCase,
  GetCountUseCase,
  ListCountsUseCase,
  PostCountUseCase,
  RecordCountsUseCase,
  RecountUseCase,
  StartCountUseCase,
  SubmitCountUseCase,
} from '../application';
import { CountStatus, type StockCount } from '../domain';

const INT = /^\d{1,19}$/;

export class CreateCountRequestDto {
  @Expose() @IsString() @Length(1, 36) warehouseId!: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  itemIds?: string[];
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class CountEntryRequestDto {
  @Expose() @IsString() @Length(1, 36) lineId!: string;
  @Expose() @IsString() @Matches(INT) countedQty!: string;
}

export class RecordCountsRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CountEntryRequestDto)
  entries!: CountEntryRequestDto[];
}

export class CountActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class ListCountsQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 36) warehouseId?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(CountStatus))
  status?: CountStatus;
}

export class CountLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() itemId!: string;
  @Expose() itemSku!: string;
  @Expose() lotId!: string | null;
  @Expose() lotNumber!: string | null;
  @Expose() uomCode!: string;
  @Expose() systemQty!: string;
  @Expose() countedQty!: string | null;
  @Expose() varianceQty!: string;
  @Expose() unitCostMinor!: string;
}

export class CountResponseDto {
  @Expose() id!: string;
  @Expose() number!: string;
  @Expose() warehouseId!: string;
  @Expose() status!: string;
  @Expose() notes!: string | null;
  @Expose() approvalRequestId!: string | null;
  @Expose() varianceValueMinor!: string;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() countedAt!: string | null;
  @Expose() postedAt!: string | null;
  @Expose() @Type(() => CountLineResponseDto) lines!: CountLineResponseDto[];
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}

export class CountListResponseDto {
  @Expose() @Type(() => CountResponseDto) items!: CountResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

function toDto(c: StockCount): CountResponseDto {
  const s = c.snapshot();
  const d = new CountResponseDto();
  d.id = s.id;
  d.number = s.number;
  d.warehouseId = s.warehouseId;
  d.status = s.status;
  d.notes = s.notes;
  d.approvalRequestId = s.approvalRequestId;
  d.varianceValueMinor = c.varianceValueMinor.toString();
  d.version = s.version;
  d.createdBy = s.createdBy;
  d.countedAt = s.countedAt?.toISOString() ?? null;
  d.postedAt = s.postedAt?.toISOString() ?? null;
  d.lines = s.lines.map((l) => {
    const x = new CountLineResponseDto();
    x.id = l.id;
    x.lineNo = l.lineNo;
    x.itemId = l.itemId;
    x.itemSku = l.itemSku;
    x.lotId = l.lotId;
    x.lotNumber = l.lotNumber;
    x.uomCode = l.uomCode;
    x.systemQty = l.systemQty.toString();
    x.countedQty = l.countedQty?.toString() ?? null;
    x.varianceQty = l.varianceQty.toString();
    x.unitCostMinor = l.unitCostMinor.toString();
    return x;
  });
  d.createdAt = s.createdAt.toISOString();
  d.updatedAt = s.updatedAt.toISOString();
  return d;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/counts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CountController {
  constructor(
    private readonly createSheet: CreateCountSheetUseCase,
    private readonly startCount: StartCountUseCase,
    private readonly recordCounts: RecordCountsUseCase,
    private readonly submitCount: SubmitCountUseCase,
    private readonly postCount: PostCountUseCase,
    private readonly recount: RecountUseCase,
    private readonly cancelCount: CancelCountUseCase,
    private readonly getCount: GetCountUseCase,
    private readonly listCounts: ListCountsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockCount'))
  async list(@Query() q: ListCountsQueryDto): Promise<CountListResponseDto> {
    const r = await this.listCounts.execute({
      warehouseId: q.warehouseId ?? null,
      status: q.status ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new CountListResponseDto();
    dto.items = r.items.map(toDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'StockCount'))
  async find(@Param('id') id: string): Promise<CountResponseDto> {
    return toDto(await this.getCount.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Freeze system quantities of a warehouse into a count sheet',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'StockCount'))
  async create(@Body() body: CreateCountRequestDto): Promise<CountResponseDto> {
    return toDto(
      await this.createSheet.execute({
        warehouseId: body.warehouseId,
        itemIds: body.itemIds ?? null,
        notes: body.notes ?? null,
      }),
    );
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'StockCount'))
  async start(
    @Param('id') id: string,
    @Body() body: CountActionRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.startCount.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/counts')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'StockCount'))
  async record(
    @Param('id') id: string,
    @Body() body: RecordCountsRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.recordCounts.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
        entries: body.entries.map((e) => ({
          lineId: e.lineId,
          countedQty: BigInt(e.countedQty),
        })),
      }),
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'COUNTING -> REVIEW; variances open a STOCK_ADJUSTMENT approval',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'StockCount'))
  async submit(
    @Param('id') id: string,
    @Body() body: CountActionRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.submitCount.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply the approval outcome: post adjustments or send back to counting',
  })
  @CheckPolicies((ability) => ability.can(Action.Approve, 'StockCount'))
  async post(
    @Param('id') id: string,
    @Body() body: CountActionRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.postCount.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/recount')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'StockCount'))
  async recountEndpoint(
    @Param('id') id: string,
    @Body() body: CountActionRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.recount.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'StockCount'))
  async cancel(
    @Param('id') id: string,
    @Body() body: CountActionRequestDto,
  ): Promise<CountResponseDto> {
    return toDto(
      await this.cancelCount.execute({
        countId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}
