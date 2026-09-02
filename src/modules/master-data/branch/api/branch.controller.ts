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
  CreateBranchUseCase,
  GetBranchUseCase,
  ListBranchesUseCase,
} from '../application';

import {
  BranchResponseDto,
  CreateBranchRequestDto,
  ListBranchesQueryDto,
  ListBranchesResponseDto,
  toBranchResponseDto,
} from './dto';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BranchController {
  constructor(
    private readonly createBranch: CreateBranchUseCase,
    private readonly getBranch: GetBranchUseCase,
    private readonly listBranches: ListBranchesUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Branch'))
  async list(
    @Query() query: ListBranchesQueryDto,
  ): Promise<ListBranchesResponseDto> {
    const result = await this.listBranches.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
      companyId: query.companyId ?? null,
    });
    const dto = new ListBranchesResponseDto();
    dto.items = result.items.map(toBranchResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Branch'))
  async find(@Param('id') id: string): Promise<BranchResponseDto> {
    return toBranchResponseDto(await this.getBranch.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Branch'))
  async create(
    @Body() body: CreateBranchRequestDto,
  ): Promise<BranchResponseDto> {
    const branch = await this.createBranch.execute({
      companyId: body.companyId,
      code: body.code,
      name: body.name,
      branchNumber: body.branchNumber ?? null,
      address: body.address ?? null,
    });
    return toBranchResponseDto(branch);
  }
}
