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
  CancelApprovalUseCase,
  DecideApprovalUseCase,
  GetApprovalRequestUseCase,
  ListDocumentApprovalsUseCase,
  ListMyPendingApprovalsUseCase,
  SubmitForApprovalUseCase,
} from '../application';

import {
  ApprovalRequestListResponseDto,
  ApprovalRequestResponseDto,
  DecideRequestDto,
  DocumentApprovalsQueryDto,
  SubmitApprovalRequestDto,
  toRequestDto,
} from './dto/approval.dto';

@ApiTags('approval')
@ApiBearerAuth()
@Controller('approvals')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ApprovalRequestController {
  constructor(
    private readonly submit: SubmitForApprovalUseCase,
    private readonly decide: DecideApprovalUseCase,
    private readonly cancel: CancelApprovalUseCase,
    private readonly getRequest: GetApprovalRequestUseCase,
    private readonly listMine: ListMyPendingApprovalsUseCase,
    private readonly listForDocument: ListDocumentApprovalsUseCase,
  ) {}

  @Get('inbox')
  @ApiOperation({
    summary:
      'Pending requests the caller may decide now (own or delegated roles)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalRequest'))
  async inbox(): Promise<ApprovalRequestListResponseDto> {
    const dto = new ApprovalRequestListResponseDto();
    dto.items = (await this.listMine.execute()).map(toRequestDto);
    return dto;
  }

  @Get()
  @ApiOperation({ summary: 'Approval history of one document, newest first' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalRequest'))
  async forDocument(
    @Query() q: DocumentApprovalsQueryDto,
  ): Promise<ApprovalRequestListResponseDto> {
    const dto = new ApprovalRequestListResponseDto();
    dto.items = (
      await this.listForDocument.execute(q.documentType, q.documentId)
    ).map(toRequestDto);
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalRequest'))
  async find(@Param('id') id: string): Promise<ApprovalRequestResponseDto> {
    return toRequestDto(await this.getRequest.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Open a request for a document (documents normally do this internally via the gateway)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'ApprovalRequest'))
  async submitEndpoint(
    @Body() body: SubmitApprovalRequestDto,
  ): Promise<ApprovalRequestResponseDto> {
    return toRequestDto(
      await this.submit.execute({
        documentType: body.documentType,
        documentId: body.documentId,
        amountMinor: BigInt(body.amountMinor),
        currency: body.currency,
      }),
    );
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'ApprovalRequest'))
  async decideEndpoint(
    @Param('id') id: string,
    @Body() body: DecideRequestDto,
  ): Promise<ApprovalRequestResponseDto> {
    return toRequestDto(
      await this.decide.execute({
        requestId: id,
        decision: body.decision,
        comment: body.comment ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'ApprovalRequest'))
  async cancelEndpoint(
    @Param('id') id: string,
  ): Promise<ApprovalRequestResponseDto> {
    return toRequestDto(await this.cancel.execute(id));
  }
}
