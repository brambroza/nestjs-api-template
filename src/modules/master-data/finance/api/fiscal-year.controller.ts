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
  CheckPostingDateUseCase,
  CloseFiscalYearUseCase,
  CreateFiscalYearUseCase,
  GetFiscalYearUseCase,
  ListFiscalYearsUseCase,
  LockPeriodUseCase,
  UnlockPeriodUseCase,
} from '../application';

import {
  CreateFiscalYearRequestDto,
  FiscalYearListResponseDto,
  FiscalYearResponseDto,
  PeriodActionRequestDto,
  PeriodNoParamDto,
  PostingCheckQueryDto,
  PostingCheckResponseDto,
  UnlockPeriodRequestDto,
  toFiscalYearDto,
  toPostingCheckDto,
} from './dto/fiscal-year.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class FiscalYearController {
  constructor(
    private readonly createYear: CreateFiscalYearUseCase,
    private readonly getYear: GetFiscalYearUseCase,
    private readonly listYears: ListFiscalYearsUseCase,
    private readonly lockPeriod: LockPeriodUseCase,
    private readonly unlockPeriod: UnlockPeriodUseCase,
    private readonly closeYear: CloseFiscalYearUseCase,
    private readonly checkPosting: CheckPostingDateUseCase,
  ) {}

  @Get('companies/:companyId/fiscal-years')
  @CheckPolicies((ability) => ability.can(Action.Read, 'FiscalYear'))
  async list(
    @Param('companyId') companyId: string,
  ): Promise<FiscalYearListResponseDto> {
    const dto = new FiscalYearListResponseDto();
    dto.items = (await this.listYears.execute(companyId)).map(toFiscalYearDto);
    return dto;
  }

  @Post('companies/:companyId/fiscal-years')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a fiscal year with 12 monthly periods from startDate',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'FiscalYear'))
  async create(
    @Param('companyId') companyId: string,
    @Body() body: CreateFiscalYearRequestDto,
  ): Promise<FiscalYearResponseDto> {
    return toFiscalYearDto(
      await this.createYear.execute({
        companyId,
        name: body.name,
        startDate: body.startDate,
      }),
    );
  }

  @Get('companies/:companyId/posting-check')
  @ApiOperation({
    summary: 'May a journal be posted on this date? (the Phase C gate)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, 'FiscalYear'))
  async postingCheck(
    @Param('companyId') companyId: string,
    @Query() q: PostingCheckQueryDto,
  ): Promise<PostingCheckResponseDto> {
    return toPostingCheckDto(
      await this.checkPosting.execute({ companyId, date: q.date }),
    );
  }

  @Get('fiscal-years/:id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'FiscalYear'))
  async find(@Param('id') id: string): Promise<FiscalYearResponseDto> {
    return toFiscalYearDto(await this.getYear.execute(id));
  }

  @Post('fiscal-years/:id/periods/:periodNo/lock')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'FiscalYear'))
  async lock(
    @Param('id') id: string,
    @Param() params: PeriodNoParamDto,
    @Body() body: PeriodActionRequestDto,
  ): Promise<FiscalYearResponseDto> {
    return toFiscalYearDto(
      await this.lockPeriod.execute({
        fiscalYearId: id,
        periodNo: params.periodNo,
        reason: body.reason ?? null,
      }),
    );
  }

  @Post('fiscal-years/:id/periods/:periodNo/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-open a locked period; the reason is recorded on the period',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'FiscalYear'))
  async unlock(
    @Param('id') id: string,
    @Param() params: PeriodNoParamDto,
    @Body() body: UnlockPeriodRequestDto,
  ): Promise<FiscalYearResponseDto> {
    return toFiscalYearDto(
      await this.unlockPeriod.execute({
        fiscalYearId: id,
        periodNo: params.periodNo,
        reason: body.reason,
      }),
    );
  }

  @Post('fiscal-years/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Irreversible year-end close; every period must already be LOCKED',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'FiscalYear'))
  async close(@Param('id') id: string): Promise<FiscalYearResponseDto> {
    return toFiscalYearDto(await this.closeYear.execute(id));
  }
}
