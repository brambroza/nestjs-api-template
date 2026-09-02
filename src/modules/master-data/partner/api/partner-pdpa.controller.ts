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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CreatePdpaRequestUseCase,
  FulfilPdpaRequestUseCase,
  GetConsentStateUseCase,
  ListPdpaRequestsUseCase,
  RecordConsentUseCase,
  RejectPdpaRequestUseCase,
} from '../application';
import type { PartnerRef } from '../domain';

import {
  ConsentRecordResponseDto,
  ConsentViewResponseDto,
  CreatePdpaRequestDto,
  FulfilPdpaRequestDto,
  FulfilPdpaRequestResponseDto,
  PdpaRequestListResponseDto,
  PdpaRequestResponseDto,
  RecordConsentRequestDto,
  RejectPdpaRequestDto,
  toConsentRecordDto,
  toConsentStateDto,
  toPartnerDataExportDto,
  toPdpaRequestDto,
} from './dto';
import { PARTNER_ROUTES, PartnerRefParam } from './partner-ref.param';

@ApiTags('partners')
@ApiBearerAuth()
@ApiParam({ name: 'partnerId', description: 'Customer or vendor id' })
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PartnerPdpaController {
  constructor(
    private readonly recordConsent: RecordConsentUseCase,
    private readonly getConsentState: GetConsentStateUseCase,
    private readonly createRequest: CreatePdpaRequestUseCase,
    private readonly listRequests: ListPdpaRequestsUseCase,
    private readonly fulfilRequest: FulfilPdpaRequestUseCase,
    private readonly rejectRequest: RejectPdpaRequestUseCase,
  ) {}

  // ---- consent -------------------------------------------------------------

  @Get(PARTNER_ROUTES.consents)
  @ApiOperation({
    summary: 'Current consent per purpose + full append-only history',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'PdpaConsent'))
  async consents(
    @PartnerRefParam() partner: PartnerRef,
  ): Promise<ConsentViewResponseDto> {
    const view = await this.getConsentState.execute(partner);
    const dto = new ConsentViewResponseDto();
    dto.state = view.state.map(toConsentStateDto);
    dto.history = view.history.map(toConsentRecordDto);
    return dto;
  }

  @Post(PARTNER_ROUTES.consents)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Append a GRANT or WITHDRAW record' })
  @CheckPolicies((ability) => ability.can(Action.Create, 'PdpaConsent'))
  async record(
    @PartnerRefParam() partner: PartnerRef,
    @Body() body: RecordConsentRequestDto,
  ): Promise<ConsentRecordResponseDto> {
    const rec = await this.recordConsent.execute({
      partner,
      contactId: body.contactId ?? null,
      purpose: body.purpose,
      action: body.action,
      source: body.source,
      evidenceRef: body.evidenceRef ?? null,
      note: body.note ?? null,
    });
    return toConsentRecordDto(rec);
  }

  // ---- data-subject requests ----------------------------------------------

  @Get(PARTNER_ROUTES.requests)
  @CheckPolicies((ability) => ability.can(Action.Read, 'PdpaRequest'))
  async requests(
    @PartnerRefParam() partner: PartnerRef,
  ): Promise<PdpaRequestListResponseDto> {
    const items = await this.listRequests.execute(partner);
    const dto = new PdpaRequestListResponseDto();
    dto.items = items.map(toPdpaRequestDto);
    return dto;
  }

  @Post(PARTNER_ROUTES.requests)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log an EXPORT or ERASURE request from the data subject',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'PdpaRequest'))
  async create(
    @PartnerRefParam() partner: PartnerRef,
    @Body() body: CreatePdpaRequestDto,
  ): Promise<PdpaRequestResponseDto> {
    const req = await this.createRequest.execute({
      partner,
      requestType: body.requestType,
      reason: body.reason ?? null,
    });
    return toPdpaRequestDto(req);
  }

  @Post(PARTNER_ROUTES.requestFulfil)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Fulfil: EXPORT returns the data bundle; ERASURE anonymises contacts in one transaction',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'PdpaRequest'))
  async fulfil(
    @PartnerRefParam() partner: PartnerRef,
    @Param('requestId') requestId: string,
    @Body() body: FulfilPdpaRequestDto,
  ): Promise<FulfilPdpaRequestResponseDto> {
    const result = await this.fulfilRequest.execute({
      partner,
      requestId,
      note: body.note ?? null,
    });
    const dto = new FulfilPdpaRequestResponseDto();
    dto.request = toPdpaRequestDto(result.request);
    dto.export = result.export ? toPartnerDataExportDto(result.export) : null;
    return dto;
  }

  @Post(PARTNER_ROUTES.requestReject)
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'PdpaRequest'))
  async reject(
    @PartnerRefParam() partner: PartnerRef,
    @Param('requestId') requestId: string,
    @Body() body: RejectPdpaRequestDto,
  ): Promise<PdpaRequestResponseDto> {
    const req = await this.rejectRequest.execute({
      partner,
      requestId,
      note: body.note,
    });
    return toPdpaRequestDto(req);
  }
}
