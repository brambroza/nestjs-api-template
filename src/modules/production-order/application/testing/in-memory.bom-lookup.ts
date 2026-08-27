import type { BomLine, OrderId } from '../../domain';
import type { BomLookupPort } from '../ports/bom-lookup.port';

export class InMemoryBomLookup implements BomLookupPort {
  private readonly byOrder = new Map<string, readonly BomLine[]>();

  set(orderId: OrderId, lines: readonly BomLine[]): void {
    this.byOrder.set(orderId, lines);
  }

  async findByOrderId(orderId: OrderId): Promise<readonly BomLine[]> {
    return this.byOrder.get(orderId) ?? [];
  }
}
