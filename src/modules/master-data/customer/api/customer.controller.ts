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
  CreateCustomerUseCase,
  GetCustomerUseCase,
  ListCustomersUseCase,
} from '../application';

import {
  CreateCustomerRequestDto,
  CustomerResponseDto,
  ListCustomersQueryDto,
  ListCustomersResponseDto,
  toCustomerResponseDto,
} from './dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CustomerController {
  constructor(
    private readonly createCustomer: CreateCustomerUseCase,
    private readonly getCustomer: GetCustomerUseCase,
    private readonly listCustomers: ListCustomersUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Customer'))
  async list(
    @Query() query: ListCustomersQueryDto,
  ): Promise<ListCustomersResponseDto> {
    const result = await this.listCustomers.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
    });
    const dto = new ListCustomersResponseDto();
    dto.items = result.items.map(toCustomerResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Customer'))
  async find(@Param('id') id: string): Promise<CustomerResponseDto> {
    const customer = await this.getCustomer.execute(id);
    return toCustomerResponseDto(customer);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Customer'))
  async create(
    @Body() body: CreateCustomerRequestDto,
  ): Promise<CustomerResponseDto> {
    const customer = await this.createCustomer.execute({
      code: body.code,
      name: body.name,
      taxId: body.taxId ?? null,
      creditLimitSatang:
        body.creditLimitSatang !== undefined
          ? BigInt(body.creditLimitSatang)
          : undefined,
      paymentTermsDays: body.paymentTermsDays,
    });
    return toCustomerResponseDto(customer);
  }
}
