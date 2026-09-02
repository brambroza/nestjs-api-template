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
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountTreeUseCase,
} from '../application';

import {
  AccountResponseDto,
  AccountTreeResponseDto,
  CreateAccountRequestDto,
  ListAccountsQueryDto,
  toAccountDto,
  toAccountTreeNodeDto,
} from './dto/account.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AccountController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly listTree: ListAccountTreeUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Chart of accounts as a tree, ordered by code' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'Account'))
  async tree(
    @Query() q: ListAccountsQueryDto,
  ): Promise<AccountTreeResponseDto> {
    const dto = new AccountTreeResponseDto();
    dto.roots = (await this.listTree.execute({ activeOnly: q.activeOnly })).map(
      toAccountTreeNodeDto,
    );
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Account'))
  async find(@Param('id') id: string): Promise<AccountResponseDto> {
    return toAccountDto(await this.getAccount.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Account'))
  async create(
    @Body() body: CreateAccountRequestDto,
  ): Promise<AccountResponseDto> {
    return toAccountDto(
      await this.createAccount.execute({
        code: body.code,
        name: body.name,
        nameTh: body.nameTh ?? null,
        type: body.type,
        parentId: body.parentId ?? null,
        isPostable: body.isPostable,
      }),
    );
  }
}
