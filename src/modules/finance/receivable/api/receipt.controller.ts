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

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  ArAgingUseCase,
  AutoMatchPreviewUseCase,
  CreateReceiptUseCase,
  CustomerStatementUseCase,
  GetReceiptUseCase,
  ListReceiptsUseCase,
  PostReceiptUseCase,
  VoidReceiptUseCase,
} from '../application';

import {
  AgingQueryDto,
  AgingResponseDto,
  AutoMatchRequestDto,
  CreateReceiptRequestDto,
  ListReceiptsQueryDto,
  MatchProposalResponseDto,
  ReceiptActionRequestDto,
  ReceiptListResponseDto,
  ReceiptResponseDto,
  StatementQueryDto,
  StatementResponseDto,
  toAgingRowDto,
  toReceiptDto,
  toStatementLineDto,
} from './dto/receivable.dto';

@ApiTags('finance-ar')
@ApiBearerAuth()
@Controller('receipts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ReceiptController {
  constructor(
    private readonly createReceipt: CreateReceiptUseCase,
    private readonly postReceipt: PostReceiptUseCase,
    private readonly voidReceipt: VoidReceiptUseCase,
    private readonly getReceipt: GetReceiptUseCase,
    private readonly listReceipts: ListReceiptsUseCase,
    private readonly autoMatch: AutoMatchPreviewUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Receipt'))
  async list(
    @Query() q: ListReceiptsQueryDto,
  ): Promise<ReceiptListResponseDto> {
    const r = await this.listReceipts.execute({
      customerId: q.customerId ?? null,
      status: q.status ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new ReceiptListResponseDto();
    dto.items = r.items.map(toReceiptDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Receipt'))
  async find(@Param('id') id: string): Promise<ReceiptResponseDto> {
    return toReceiptDto(await this.getReceipt.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Draft a receipt; autoMatch proposes allocations by reference / amount / FIFO',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'Receipt'))
  async create(
    @Body() body: CreateReceiptRequestDto,
  ): Promise<ReceiptResponseDto> {
    return toReceiptDto(
      await this.createReceipt.execute({
        companyId: body.companyId,
        customerId: body.customerId,
        method: body.method,
        amountMinor: BigInt(body.amountMinor),
        whtMinor: body.whtMinor === undefined ? null : BigInt(body.whtMinor),
        currency: body.currency ?? null,
        receiptDate: body.receiptDate ?? null,
        reference: body.reference ?? null,
        chequeNumber: body.chequeNumber ?? null,
        chequeBank: body.chequeBank ?? null,
        chequeDate: body.chequeDate ?? null,
        notes: body.notes ?? null,
        allocations: body.allocations
          ? body.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amountMinor: BigInt(a.amountMinor),
            }))
          : null,
        autoMatch: body.autoMatch ?? false,
      }),
    );
  }

  @Post('auto-match')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview allocations for an incoming payment (T-336)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'Receipt'))
  async preview(
    @Body() body: AutoMatchRequestDto,
  ): Promise<MatchProposalResponseDto> {
    const p = await this.autoMatch.execute({
      customerId: body.customerId,
      settlementMinor: BigInt(body.settlementMinor),
      reference: body.reference ?? null,
    });
    const dto = new MatchProposalResponseDto();
    dto.allocations = p.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: a.amountMinor.toString(),
      rule: a.rule,
    }));
    dto.unappliedMinor = p.unappliedMinor.toString();
    return dto;
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Submit, 'Receipt'))
  async post(
    @Param('id') id: string,
    @Body() body: ReceiptActionRequestDto,
  ): Promise<ReceiptResponseDto> {
    return toReceiptDto(
      await this.postReceipt.execute({
        receiptId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'Receipt'))
  async voidEndpoint(
    @Param('id') id: string,
    @Body() body: ReceiptActionRequestDto,
  ): Promise<ReceiptResponseDto> {
    return toReceiptDto(
      await this.voidReceipt.execute({
        receiptId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}

@ApiTags('finance-ar')
@ApiBearerAuth()
@Controller('ar')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ArReportController {
  constructor(
    private readonly aging: ArAgingUseCase,
    private readonly statement: CustomerStatementUseCase,
  ) {}

  @Get('aging')
  @ApiOperation({
    summary: 'AR aging 0-30 / 31-60 / 61-90 / 90+ per customer (T-335)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesInvoice'))
  async agingReport(@Query() q: AgingQueryDto): Promise<AgingResponseDto> {
    const r = await this.aging.execute({
      asOf: q.asOf ?? null,
      customerId: q.customerId ?? null,
    });
    const dto = new AgingResponseDto();
    dto.asOf = r.asOf;
    dto.totalMinor = r.totalMinor.toString();
    dto.rows = r.rows.map(toAgingRowDto);
    return dto;
  }

  @Get('customers/:customerId/statement')
  @ApiOperation({ summary: 'Customer statement with running balance (T-337)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesInvoice'))
  async customerStatement(
    @Param('customerId') customerId: string,
    @Query() q: StatementQueryDto,
  ): Promise<StatementResponseDto> {
    const r = await this.statement.execute({
      customerId,
      from: q.from,
      to: q.to,
    });
    const dto = new StatementResponseDto();
    dto.customerId = customerId;
    dto.from = q.from;
    dto.to = q.to;
    dto.closingBalanceMinor = r.closingBalanceMinor.toString();
    dto.lines = r.lines.map(toStatementLineDto);
    return dto;
  }
}
