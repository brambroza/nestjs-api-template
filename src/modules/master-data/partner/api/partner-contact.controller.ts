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
import { AddContactUseCase, ListContactsUseCase } from '../application';
import type { PartnerRef } from '../domain';

import {
  ContactListResponseDto,
  ContactResponseDto,
  CreateContactRequestDto,
  ListContactsQueryDto,
  toContactResponseDto,
} from './dto';
import { PARTNER_ROUTES, PartnerRefParam } from './partner-ref.param';

@ApiTags('partners')
@ApiBearerAuth()
@ApiParam({ name: 'partnerId', description: 'Customer or vendor id' })
@Controller()
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PartnerContactController {
  constructor(
    private readonly addContact: AddContactUseCase,
    private readonly listContacts: ListContactsUseCase,
  ) {}

  @Get(PARTNER_ROUTES.contacts)
  @CheckPolicies((ability) => ability.can(Action.Read, 'PartnerContact'))
  async list(
    @PartnerRefParam() partner: PartnerRef,
    @Query() query: ListContactsQueryDto,
  ): Promise<ContactListResponseDto> {
    const items = await this.listContacts.execute({
      partner,
      activeOnly: query.activeOnly,
    });
    const dto = new ContactListResponseDto();
    dto.items = items.map(toContactResponseDto);
    return dto;
  }

  @Post(PARTNER_ROUTES.contacts)
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'PartnerContact'))
  async create(
    @PartnerRefParam() partner: PartnerRef,
    @Body() body: CreateContactRequestDto,
  ): Promise<ContactResponseDto> {
    const contact = await this.addContact.execute({
      partner,
      fullName: body.fullName,
      position: body.position ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isPrimary: body.isPrimary,
    });
    return toContactResponseDto(contact);
  }
}
