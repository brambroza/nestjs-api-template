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
  CreateApprovalPolicyUseCase,
  DeactivateApprovalPolicyUseCase,
  GetApprovalPolicyUseCase,
  ListApprovalPoliciesUseCase,
} from '../application';

import {
  CreatePolicyRequestDto,
  ListPoliciesQueryDto,
  PolicyListResponseDto,
  PolicyResponseDto,
  toPolicyDto,
} from './dto/approval.dto';

@ApiTags('approval')
@ApiBearerAuth()
@Controller('approval-policies')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ApprovalPolicyController {
  constructor(
    private readonly createPolicy: CreateApprovalPolicyUseCase,
    private readonly listPolicies: ListApprovalPoliciesUseCase,
    private readonly getPolicy: GetApprovalPolicyUseCase,
    private readonly deactivate: DeactivateApprovalPolicyUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalPolicy'))
  async list(@Query() q: ListPoliciesQueryDto): Promise<PolicyListResponseDto> {
    const dto = new PolicyListResponseDto();
    dto.items = (
      await this.listPolicies.execute({ activeOnly: q.activeOnly })
    ).map(toPolicyDto);
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'ApprovalPolicy'))
  async find(@Param('id') id: string): Promise<PolicyResponseDto> {
    return toPolicyDto(await this.getPolicy.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Approval matrix for a document type (steps by amount tier); replaceActive=true swaps the current one',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'ApprovalPolicy'))
  async create(
    @Body() body: CreatePolicyRequestDto,
  ): Promise<PolicyResponseDto> {
    return toPolicyDto(
      await this.createPolicy.execute({
        documentType: body.documentType,
        name: body.name,
        replaceActive: body.replaceActive ?? false,
        steps: body.steps.map((s) => ({
          name: s.name,
          approverRole: s.approverRole,
          minAmountMinor:
            s.minAmountMinor !== undefined ? BigInt(s.minAmountMinor) : null,
          requiredApprovals: s.requiredApprovals,
        })),
      }),
    );
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, 'ApprovalPolicy'))
  async deactivateEndpoint(
    @Param('id') id: string,
  ): Promise<PolicyResponseDto> {
    return toPolicyDto(await this.deactivate.execute(id));
  }
}
