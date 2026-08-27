import { Expose, Type } from 'class-transformer';

class ResponseMoney {
  @Expose() amount!: string;
  @Expose() currency!: 'THB' | 'USD' | 'JPY';
}

class ResponseQuantity {
  @Expose() value!: string;
  @Expose() uom!: string;
}

/**
 * Response shape sent to HTTP clients. Every field is @Expose'd on
 * purpose — ClassSerializerInterceptor's excludeAll strategy blocks
 * anything else, so a new domain field cannot leak by accident. Cost
 * or margin fields would be added here only when the caller is
 * authorized to see them.
 */
export class ProductionOrderResponseDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() createdBy!: string;
  @Expose() status!: string;

  @Expose()
  @Type(() => ResponseQuantity)
  orderedQuantity!: ResponseQuantity;

  @Expose()
  @Type(() => ResponseMoney)
  totalAmount!: ResponseMoney;

  @Expose() firstApprover!: string | null;
  @Expose() secondApprover!: string | null;

  @Expose()
  @Type(() => ResponseQuantity)
  producedQuantity!: ResponseQuantity;

  @Expose() version!: number;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}
