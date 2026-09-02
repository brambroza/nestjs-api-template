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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../shared/auth/policies';
import {
  CreateDelegationUseCase,
  ListMyDelegationsUseCase,
  RevokeDelegationUseCase,
} from '../application';

import {
  CreateDelegationRequestDto,
  DelegationListResponseDto,
  DelegationResponseDto,
  toDelegationDto,
} from './dto/approval.dto';

@ApiTags('approval')
@ApiBearerAuth()
@Controller('approval-delegations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DelegationController {
  constructor(
    private readonly create: CreateDelegationUseCase,
    private readonly listMine: ListMyDelegationsUseCase,
    private readonly revoke: RevokeDelegationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Delegations the caller has granted' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalDelegation'))
  async list(): Promise<DelegationListResponseDto> {
    const dto = new DelegationListResponseDto();
    dto.items = (await this.listMine.execute()).map(toDelegationDto);
    return dto;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Lend my approval roles to another user for a date range',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'ApprovalDelegation'))
  async createEndpoint(
    @Body() body: CreateDelegationRequestDto,
  ): Promise<DelegationResponseDto> {
    return toDelegationDto(
      await this.create.execute({
        toUserId: body.toUserId,
        fromDate: body.fromDate,
        toDate: body.toDate,
        reason: body.reason ?? null,
      }),
    );
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'ApprovalDelegation'))
  async revokeEndpoint(
    @Param('id') id: string,
  ): Promise<DelegationResponseDto> {
    return toDelegationDto(await this.revoke.execute(id));
  }
}
