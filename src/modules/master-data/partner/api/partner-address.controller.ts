import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import { AddAddressUseCase, ListAddressesUseCase } from '../application';
import type { PartnerRef } from '../domain';

import {
  AddressListResponseDto,
  AddressResponseDto,
  CreateAddressRequestDto,
  ListAddressesQueryDto,
  toAddressResponseDto,
} from './dto';
import { PARTNER_ROUTES, PartnerRefParam } from './partner-ref.param';

@ApiTags('partners')
@ApiBearerAuth()
@ApiParam({ name: 'partnerId', description: 'Customer or vendor id' })
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PartnerAddressController {
  constructor(
    private readonly addAddress: AddAddressUseCase,
    private readonly listAddresses: ListAddressesUseCase,
  ) {}

  @Get(PARTNER_ROUTES.addresses)
  @CheckPolicies((ability) => ability.can(Action.Read, 'PartnerAddress'))
  async list(
    @PartnerRefParam() partner: PartnerRef,
    @Query() query: ListAddressesQueryDto,
  ): Promise<AddressListResponseDto> {
    const items = await this.listAddresses.execute({
      partner,
      activeOnly: query.activeOnly,
    });
    const dto = new AddressListResponseDto();
    dto.items = items.map(toAddressResponseDto);
    return dto;
  }

  @Post(PARTNER_ROUTES.addresses)
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'PartnerAddress'))
  async create(
    @PartnerRefParam() partner: PartnerRef,
    @Body() body: CreateAddressRequestDto,
  ): Promise<AddressResponseDto> {
    const address = await this.addAddress.execute({
      partner,
      addressType: body.addressType,
      label: body.label ?? null,
      address: {
        line1: body.line1,
        line2: body.line2,
        subDistrict: body.subDistrict,
        district: body.district,
        province: body.province,
        postalCode: body.postalCode,
      },
      countryCode: body.countryCode ?? null,
      branchNumber: body.branchNumber ?? null,
      isDefault: body.isDefault,
    });
    return toAddressResponseDto(address);
  }
}
