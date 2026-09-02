import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  ListReorderRulesUseCase,
  ReorderSweepUseCase,
  UpsertReorderRuleUseCase,
} from '../application';
import type { ReorderRuleSnapshot } from '../domain';

const INT = /^\d{1,19}$/;

export class UpsertReorderRuleRequestDto {
  @Expose() @IsString() @Length(1, 36) warehouseId!: string;
  @Expose() @IsString() @Length(1, 36) itemId!: string;
  @Expose() @IsString() @Matches(INT) reorderPoint!: string;
  @Expose() @IsString() @Matches(INT) reorderQty!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) preferredVendorId?: string;
  @Expose() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListReorderRulesQueryDto {
  @Expose() @IsOptional() @IsString() @Length(1, 36) warehouseId?: string;
}

export class ReorderRuleResponseDto {
  @Expose() id!: string;
  @Expose() warehouseId!: string;
  @Expose() itemId!: string;
  @Expose() reorderPoint!: string;
  @Expose() reorderQty!: string;
  @Expose() preferredVendorId!: string | null;
  @Expose() isActive!: boolean;
  @Expose() lastTriggeredAt!: string | null;
}

export class ReorderRuleListResponseDto {
  @Expose()
  @Type(() => ReorderRuleResponseDto)
  items!: ReorderRuleResponseDto[];
}

export class ReorderSweepResponseDto {
  @Expose() checked!: number;
  @Expose() triggered!: number;
  @Expose() requisitionNumbers!: string[];
}

function toDto(r: ReorderRuleSnapshot): ReorderRuleResponseDto {
  const d = new ReorderRuleResponseDto();
  d.id = r.id;
  d.warehouseId = r.warehouseId;
  d.itemId = r.itemId;
  d.reorderPoint = r.reorderPoint.toString();
  d.reorderQty = r.reorderQty.toString();
  d.preferredVendorId = r.preferredVendorId;
  d.isActive = r.isActive;
  d.lastTriggeredAt = r.lastTriggeredAt?.toISOString() ?? null;
  return d;
}

@ApiTags('purchase')
@ApiBearerAuth()
@Controller('reorder-rules')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ReorderRuleController {
  constructor(
    private readonly upsertRule: UpsertReorderRuleUseCase,
    private readonly listRules: ListReorderRulesUseCase,
    private readonly sweep: ReorderSweepUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'ReorderRule'))
  async list(
    @Query() q: ListReorderRulesQueryDto,
  ): Promise<ReorderRuleListResponseDto> {
    const dto = new ReorderRuleListResponseDto();
    dto.items = (await this.listRules.execute(q.warehouseId ?? null)).map(
      toDto,
    );
    return dto;
  }

  @Put()
  @ApiOperation({ summary: 'Create or update the rule for (warehouse, item)' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'ReorderRule'))
  async upsert(
    @Body() body: UpsertReorderRuleRequestDto,
  ): Promise<ReorderRuleResponseDto> {
    return toDto(
      await this.upsertRule.execute({
        warehouseId: body.warehouseId,
        itemId: body.itemId,
        reorderPoint: BigInt(body.reorderPoint),
        reorderQty: BigInt(body.reorderQty),
        preferredVendorId: body.preferredVendorId ?? null,
        isActive: body.isActive,
      }),
    );
  }

  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run the reorder sweep now for the current tenant (the cron does this nightly)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, 'ReorderRule'))
  async runSweep(): Promise<ReorderSweepResponseDto> {
    const r = await this.sweep.execute();
    const dto = new ReorderSweepResponseDto();
    dto.checked = r.checked;
    dto.triggered = r.triggered;
    dto.requisitionNumbers = [...r.requisitionNumbers];
    return dto;
  }
}
