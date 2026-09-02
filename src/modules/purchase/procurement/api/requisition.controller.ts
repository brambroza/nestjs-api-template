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
  CancelRequisitionUseCase,
  ConfirmRequisitionUseCase,
  CreateRequisitionUseCase,
  GetRequisitionUseCase,
  ListRequisitionsUseCase,
  ReopenRequisitionUseCase,
  SubmitRequisitionUseCase,
  UpdateRequisitionUseCase,
} from '../application';

import {
  CreateRequisitionRequestDto,
  DocumentActionRequestDto,
  ListRequisitionsQueryDto,
  RequisitionListResponseDto,
  RequisitionResponseDto,
  UpdateRequisitionRequestDto,
  toRequisitionDto,
  toRequisitionLineRequest,
} from './dto/procurement.dto';

@ApiTags('purchase')
@ApiBearerAuth()
@Controller('purchase-requisitions')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class RequisitionController {
  constructor(
    private readonly createPr: CreateRequisitionUseCase,
    private readonly updatePr: UpdateRequisitionUseCase,
    private readonly submitPr: SubmitRequisitionUseCase,
    private readonly confirmPr: ConfirmRequisitionUseCase,
    private readonly reopenPr: ReopenRequisitionUseCase,
    private readonly cancelPr: CancelRequisitionUseCase,
    private readonly getPr: GetRequisitionUseCase,
    private readonly listPr: ListRequisitionsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'PurchaseRequisition'))
  async list(
    @Query() q: ListRequisitionsQueryDto,
  ): Promise<RequisitionListResponseDto> {
    const r = await this.listPr.execute({
      limit: q.limit,
      offset: q.offset,
      status: q.status ?? null,
      mine: q.mine ?? false,
    });
    const dto = new RequisitionListResponseDto();
    dto.items = r.items.map(toRequisitionDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PurchaseRequisition'))
  async find(@Param('id') id: string): Promise<RequisitionResponseDto> {
    return toRequisitionDto(await this.getPr.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'PurchaseRequisition'))
  async create(
    @Body() body: CreateRequisitionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.createPr.execute({
        companyId: body.companyId,
        currency: body.currency ?? null,
        neededByDate: body.neededByDate ?? null,
        purpose: body.purpose ?? null,
        lines: body.lines.map(toRequisitionLineRequest),
      }),
    );
  }

  @Put(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseRequisition'))
  async update(
    @Param('id') id: string,
    @Body() body: UpdateRequisitionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.updatePr.execute({
        requisitionId: id,
        expectedVersion: body.expectedVersion ?? null,
        neededByDate: body.neededByDate,
        purpose: body.purpose,
        lines: body.lines ? body.lines.map(toRequisitionLineRequest) : null,
      }),
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PURCHASE_REQUISITION approval matrix on the estimated total',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'PurchaseRequisition'))
  async submit(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.submitPr.execute({
        requisitionId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply the approval outcome to a PENDING_APPROVAL requisition',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseRequisition'))
  async confirm(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.confirmPr.execute({
        requisitionId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'PurchaseRequisition'))
  async reopen(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.reopenPr.execute({
        requisitionId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'PurchaseRequisition'))
  async cancel(
    @Param('id') id: string,
    @Body() body: DocumentActionRequestDto,
  ): Promise<RequisitionResponseDto> {
    return toRequisitionDto(
      await this.cancelPr.execute({
        requisitionId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}
