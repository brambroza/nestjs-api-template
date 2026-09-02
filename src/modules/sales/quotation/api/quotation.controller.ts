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
  AcceptQuotationUseCase,
  CancelQuotationUseCase,
  CreateQuotationUseCase,
  GetQuotationUseCase,
  ListQuotationsUseCase,
  RejectQuotationUseCase,
  ReviseQuotationUseCase,
  SendQuotationUseCase,
  UpdateQuotationUseCase,
} from '../application';

import {
  CreateQuotationRequestDto,
  ListQuotationsQueryDto,
  QuotationListResponseDto,
  QuotationResponseDto,
  QuotationTransitionRequestDto,
  ReviseQuotationRequestDto,
  UpdateQuotationRequestDto,
  toLineRequest,
  toQuotationDto,
} from './dto/quotation.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('quotations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class QuotationController {
  constructor(
    private readonly createQuotation: CreateQuotationUseCase,
    private readonly updateQuotation: UpdateQuotationUseCase,
    private readonly sendQuotation: SendQuotationUseCase,
    private readonly acceptQuotation: AcceptQuotationUseCase,
    private readonly rejectQuotation: RejectQuotationUseCase,
    private readonly cancelQuotation: CancelQuotationUseCase,
    private readonly reviseQuotation: ReviseQuotationUseCase,
    private readonly getQuotation: GetQuotationUseCase,
    private readonly listQuotations: ListQuotationsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Quotation'))
  async list(
    @Query() q: ListQuotationsQueryDto,
  ): Promise<QuotationListResponseDto> {
    const result = await this.listQuotations.execute({
      limit: q.limit,
      offset: q.offset,
      status: q.status ?? null,
      customerId: q.customerId ?? null,
    });
    const dto = new QuotationListResponseDto();
    dto.items = result.items.map(toQuotationDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Quotation'))
  async find(@Param('id') id: string): Promise<QuotationResponseDto> {
    return toQuotationDto(await this.getQuotation.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a DRAFT quotation; lines are priced from the price lists',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'Quotation'))
  async create(
    @Body() body: CreateQuotationRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.createQuotation.execute({
        companyId: body.companyId,
        customerId: body.customerId,
        currency: body.currency ?? null,
        quoteDate: body.quoteDate ?? null,
        validUntil: body.validUntil ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        notes: body.notes ?? null,
        lines: body.lines.map(toLineRequest),
      }),
    );
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit a DRAFT (header and/or full line replacement)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'Quotation'))
  async update(
    @Param('id') id: string,
    @Body() body: UpdateQuotationRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.updateQuotation.execute({
        quotationId: id,
        expectedVersion: body.expectedVersion ?? null,
        validUntil: body.validUntil,
        paymentTermsDays: body.paymentTermsDays,
        notes: body.notes,
        lines: body.lines ? body.lines.map(toLineRequest) : null,
      }),
    );
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Submit, 'Quotation'))
  async send(
    @Param('id') id: string,
    @Body() body: QuotationTransitionRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.sendQuotation.execute({
        quotationId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer accepted (recorded by sales)' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'Quotation'))
  async accept(
    @Param('id') id: string,
    @Body() body: QuotationTransitionRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.acceptQuotation.execute({
        quotationId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'Quotation'))
  async reject(
    @Param('id') id: string,
    @Body() body: QuotationTransitionRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.rejectQuotation.execute({
        quotationId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'Quotation'))
  async cancel(
    @Param('id') id: string,
    @Body() body: QuotationTransitionRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.cancelQuotation.execute({
        quotationId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }

  @Post(':id/revise')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cut the next revision (same number) as a new DRAFT',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'Quotation'))
  async revise(
    @Param('id') id: string,
    @Body() body: ReviseQuotationRequestDto,
  ): Promise<QuotationResponseDto> {
    return toQuotationDto(
      await this.reviseQuotation.execute({
        quotationId: id,
        validUntil: body.validUntil ?? null,
      }),
    );
  }
}
