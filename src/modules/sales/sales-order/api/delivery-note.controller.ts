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

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CancelDeliveryNoteUseCase,
  GetDeliveryNoteUseCase,
  ShipDeliveryNoteUseCase,
} from '../application';

import {
  DeliveryNoteActionRequestDto,
  DeliveryNoteResponseDto,
  toDeliveryNoteDto,
} from './dto/sales-order.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('delivery-notes')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DeliveryNoteController {
  constructor(
    private readonly getNote: GetDeliveryNoteUseCase,
    private readonly shipNote: ShipDeliveryNoteUseCase,
    private readonly cancelNote: CancelDeliveryNoteUseCase,
  ) {}

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'DeliveryNote'))
  async find(@Param('id') id: string): Promise<DeliveryNoteResponseDto> {
    return toDeliveryNoteDto(await this.getNote.execute(id));
  }

  @Post(':id/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ship: posts quantities onto the sales order in the same transaction',
  })
  @CheckPolicies((ability) => ability.can(Action.Release, 'DeliveryNote'))
  async ship(
    @Param('id') id: string,
    @Body() body: DeliveryNoteActionRequestDto,
  ): Promise<DeliveryNoteResponseDto> {
    return toDeliveryNoteDto(
      await this.shipNote.execute({
        deliveryNoteId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'DeliveryNote'))
  async cancel(
    @Param('id') id: string,
    @Body() body: DeliveryNoteActionRequestDto,
  ): Promise<DeliveryNoteResponseDto> {
    return toDeliveryNoteDto(
      await this.cancelNote.execute({
        deliveryNoteId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}
