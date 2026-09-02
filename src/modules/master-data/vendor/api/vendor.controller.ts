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
  CreateVendorUseCase,
  GetVendorUseCase,
  ListVendorsUseCase,
} from '../application';

import {
  CreateVendorRequestDto,
  ListVendorsQueryDto,
  ListVendorsResponseDto,
  VendorResponseDto,
  toVendorResponseDto,
} from './dto';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class VendorController {
  constructor(
    private readonly createVendor: CreateVendorUseCase,
    private readonly getVendor: GetVendorUseCase,
    private readonly listVendors: ListVendorsUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Vendor'))
  async list(
    @Query() query: ListVendorsQueryDto,
  ): Promise<ListVendorsResponseDto> {
    const result = await this.listVendors.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
    });
    const dto = new ListVendorsResponseDto();
    dto.items = result.items.map(toVendorResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Vendor'))
  async find(@Param('id') id: string): Promise<VendorResponseDto> {
    return toVendorResponseDto(await this.getVendor.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Vendor'))
  async create(
    @Body() body: CreateVendorRequestDto,
  ): Promise<VendorResponseDto> {
    const vendor = await this.createVendor.execute({
      code: body.code,
      name: body.name,
      taxId: body.taxId ?? null,
      paymentTermsDays: body.paymentTermsDays,
    });
    return toVendorResponseDto(vendor);
  }
}
