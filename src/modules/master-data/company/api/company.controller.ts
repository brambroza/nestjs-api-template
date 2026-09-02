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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CreateCompanyUseCase,
  GetCompanyUseCase,
  ListCompaniesUseCase,
} from '../application';

import {
  CompanyResponseDto,
  CreateCompanyRequestDto,
  ListCompaniesQueryDto,
  ListCompaniesResponseDto,
  toCompanyResponseDto,
} from './dto';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CompanyController {
  constructor(
    private readonly createCompany: CreateCompanyUseCase,
    private readonly getCompany: GetCompanyUseCase,
    private readonly listCompanies: ListCompaniesUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Company'))
  async list(
    @Query() query: ListCompaniesQueryDto,
  ): Promise<ListCompaniesResponseDto> {
    const result = await this.listCompanies.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
    });
    const dto = new ListCompaniesResponseDto();
    dto.items = result.items.map(toCompanyResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Company'))
  async find(@Param('id') id: string): Promise<CompanyResponseDto> {
    return toCompanyResponseDto(await this.getCompany.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Company'))
  async create(
    @Body() body: CreateCompanyRequestDto,
  ): Promise<CompanyResponseDto> {
    const company = await this.createCompany.execute({
      code: body.code,
      name: body.name,
      legalName: body.legalName ?? null,
      taxId: body.taxId ?? null,
      baseCurrency: body.baseCurrency ?? null,
    });
    return toCompanyResponseDto(company);
  }
}
