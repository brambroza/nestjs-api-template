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
  CreateInvoiceFromSalesOrderUseCase,
  CreateManualInvoiceUseCase,
  CreateNoteUseCase,
  GetInvoiceUseCase,
  IssueInvoiceUseCase,
  ListInvoicesUseCase,
  PromptPayForInvoiceUseCase,
  UpdateInvoiceUseCase,
  VoidInvoiceUseCase,
} from '../application';

import {
  CreateInvoiceFromOrderRequestDto,
  CreateManualInvoiceRequestDto,
  CreateNoteRequestDto,
  InvoiceActionRequestDto,
  InvoiceListResponseDto,
  InvoiceResponseDto,
  ListInvoicesQueryDto,
  PromptPayResponseDto,
  UpdateInvoiceRequestDto,
  toInvoiceDto,
  toManualLine,
} from './dto/receivable.dto';

@ApiTags('finance-ar')
@ApiBearerAuth()
@Controller('sales-invoices')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class InvoiceController {
  constructor(
    private readonly fromOrder: CreateInvoiceFromSalesOrderUseCase,
    private readonly manual: CreateManualInvoiceUseCase,
    private readonly update: UpdateInvoiceUseCase,
    private readonly issue: IssueInvoiceUseCase,
    private readonly voidInvoice: VoidInvoiceUseCase,
    private readonly note: CreateNoteUseCase,
    private readonly getInvoice: GetInvoiceUseCase,
    private readonly listInvoices: ListInvoicesUseCase,
    private readonly promptPay: PromptPayForInvoiceUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesInvoice'))
  async list(
    @Query() q: ListInvoicesQueryDto,
  ): Promise<InvoiceListResponseDto> {
    const r = await this.listInvoices.execute({
      status: q.status ?? null,
      type: q.type ?? null,
      customerId: q.customerId ?? null,
      from: q.from ?? null,
      to: q.to ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new InvoiceListResponseDto();
    dto.items = r.items.map(toInvoiceDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesInvoice'))
  async find(@Param('id') id: string): Promise<InvoiceResponseDto> {
    return toInvoiceDto(await this.getInvoice.execute(id));
  }

  @Get(':id/promptpay')
  @ApiOperation({
    summary: 'PromptPay QR payload for the open balance (T-334)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'SalesInvoice'))
  async promptPayPayload(
    @Param('id') id: string,
  ): Promise<PromptPayResponseDto> {
    const r = await this.promptPay.execute(id);
    const dto = new PromptPayResponseDto();
    dto.payload = r.payload;
    dto.amountMinor = r.amountMinor.toString();
    dto.proxy = r.proxy;
    return dto;
  }

  @Post('from-sales-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Draft an invoice for delivered, un-invoiced quantities of a sales order',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'SalesInvoice'))
  async createFromOrder(
    @Body() body: CreateInvoiceFromOrderRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.fromOrder.execute({
        salesOrderId: body.salesOrderId,
        branchId: body.branchId ?? null,
        invoiceDate: body.invoiceDate ?? null,
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'SalesInvoice'))
  async create(
    @Body() body: CreateManualInvoiceRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.manual.execute({
        companyId: body.companyId,
        branchId: body.branchId ?? null,
        customerId: body.customerId,
        currency: body.currency ?? null,
        invoiceDate: body.invoiceDate ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        notes: body.notes ?? null,
        lines: body.lines.map(toManualLine),
      }),
    );
  }

  @Put(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, 'SalesInvoice'))
  async updateDraft(
    @Param('id') id: string,
    @Body() body: UpdateInvoiceRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.update.execute({
        invoiceId: id,
        expectedVersion: body.expectedVersion ?? null,
        invoiceDate: body.invoiceDate,
        paymentTermsDays: body.paymentTermsDays,
        notes: body.notes,
        lines: body.lines ? body.lines.map(toManualLine) : null,
      }),
    );
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign the gapless tax-invoice number (period gate applies)',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'SalesInvoice'))
  async issueEndpoint(
    @Param('id') id: string,
    @Body() body: InvoiceActionRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.issue.execute({
        invoiceId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'SalesInvoice'))
  async voidEndpoint(
    @Param('id') id: string,
    @Body() body: InvoiceActionRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.voidInvoice.execute({
        invoiceId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }

  @Post(':id/credit-notes')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'SalesInvoice'))
  async creditNote(
    @Param('id') id: string,
    @Body() body: CreateNoteRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.note.execute('CREDIT_NOTE', this.noteInput(id, body)),
    );
  }

  @Post(':id/debit-notes')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'SalesInvoice'))
  async debitNote(
    @Param('id') id: string,
    @Body() body: CreateNoteRequestDto,
  ): Promise<InvoiceResponseDto> {
    return toInvoiceDto(
      await this.note.execute('DEBIT_NOTE', this.noteInput(id, body)),
    );
  }

  private noteInput(id: string, body: CreateNoteRequestDto) {
    return {
      invoiceId: id,
      reason: body.reason,
      reasonText: body.reasonText ?? null,
      noteDate: body.noteDate ?? null,
      lines: body.lines.map((l) => ({
        invoiceLineId: l.invoiceLineId,
        quantity: BigInt(l.quantity),
        unitPriceMinor:
          l.unitPriceMinor === undefined ? null : BigInt(l.unitPriceMinor),
      })),
    };
  }
}
