import { DomainError } from '../../../../shared/errors';

export class BomNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.BOM_NOT_FOUND';
  constructor(readonly bomId: string) {
    super(`BOM ${bomId} not found`);
  }
}

export class DuplicateBomVersionError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_BOM_VERSION';
  constructor(
    readonly itemId: string,
    readonly version: number,
  ) {
    super(`Item ${itemId} already has BOM version ${String(version)}`);
  }
}

export class BomProductInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.BOM_PRODUCT_INVALID';
  constructor(readonly itemId: string) {
    super(`Item ${itemId} does not exist or is inactive`);
  }
}

export class BomComponentInvalidError extends DomainError {
  readonly code = 'MASTER_DATA.BOM_COMPONENT_INVALID';
  constructor(
    readonly componentItemId: string,
    readonly reason: string,
  ) {
    super(`BOM component ${componentItemId}: ${reason}`);
  }
}

export class BomCycleError extends DomainError {
  readonly code = 'MASTER_DATA.BOM_CYCLE';
  constructor(
    readonly itemId: string,
    readonly viaComponentItemId: string,
  ) {
    super(
      `Adding component ${viaComponentItemId} would make item ${itemId} a component of itself`,
    );
  }
}

export class InvalidBomError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_BOM';
}

export const BASIS_POINTS = 10_000n;

export interface BomComponentSnapshot {
  readonly id: string;
  readonly lineNo: number;
  readonly componentItemId: string;
  readonly componentSku: string;
  readonly qtyPerUnit: bigint;
  readonly qtyPerUnitUom: string;
  readonly scrapBasisPoints: bigint;
  readonly yieldBasisPoints: bigint;
  readonly minPack: bigint;
  readonly minPackUom: string;
}

export interface BomSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly productSku: string;
  readonly version: number;
  readonly name: string | null;
  readonly isActive: boolean;
  readonly components: readonly BomComponentSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBomComponentInput {
  readonly id: string;
  readonly componentItemId: string;
  readonly componentSku: string;
  readonly qtyPerUnit: bigint;
  readonly qtyPerUnitUom: string;
  readonly scrapBasisPoints?: bigint;
  readonly yieldBasisPoints?: bigint;
  readonly minPack?: bigint;
  readonly minPackUom?: string;
}

export interface CreateBomProps {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly productSku: string;
  readonly version: number;
  readonly name?: string | null;
  readonly components: readonly CreateBomComponentInput[];
  readonly now: Date;
}

/**
 * Master bill of materials for one product item, one revision. The
 * arithmetic contract matches production-order's BomLine exactly so a
 * component row can be handed to computeRequired() without conversion:
 * ratios in basis points, quantities as bigint, minPack in the same
 * unit as qtyPerUnit.
 */
export class Bom {
  private constructor(private readonly s: BomSnapshot) {}

  static create(props: CreateBomProps): Bom {
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new InvalidBomError('version must be a positive integer');
    }
    const name = (props.name ?? '').trim() || null;
    if (name !== null && name.length > 200) {
      throw new InvalidBomError('name must be at most 200 characters');
    }
    if (props.components.length === 0) {
      throw new InvalidBomError('a BOM needs at least one component');
    }
    const seen = new Set<string>();
    const components = props.components.map((c, i) => {
      if (c.componentItemId === props.itemId) {
        throw new BomComponentInvalidError(
          c.componentItemId,
          'a product cannot be its own component',
        );
      }
      if (seen.has(c.componentItemId)) {
        throw new BomComponentInvalidError(
          c.componentItemId,
          'listed more than once',
        );
      }
      seen.add(c.componentItemId);
      return Bom.component(c, i + 1);
    });
    return new Bom({
      id: props.id,
      tenantId: props.tenantId,
      itemId: props.itemId,
      productSku: props.productSku,
      version: props.version,
      name,
      isActive: false,
      components,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  private static component(
    c: CreateBomComponentInput,
    lineNo: number,
  ): BomComponentSnapshot {
    const uom = c.qtyPerUnitUom.trim();
    if (uom.length === 0 || uom.length > 16) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        'qtyPerUnitUom is invalid',
      );
    }
    if (c.qtyPerUnit <= 0n) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        'qtyPerUnit must be > 0',
      );
    }
    const scrap = c.scrapBasisPoints ?? 0n;
    if (scrap < 0n || scrap >= BASIS_POINTS) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        'scrapBasisPoints must be in [0, 10000)',
      );
    }
    const yieldBp = c.yieldBasisPoints ?? BASIS_POINTS;
    if (yieldBp <= 0n || yieldBp > BASIS_POINTS) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        'yieldBasisPoints must be in (0, 10000]',
      );
    }
    const minPack = c.minPack ?? 1n;
    if (minPack < 1n) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        'minPack must be >= 1',
      );
    }
    const minPackUom = (c.minPackUom ?? uom).trim();
    if (minPackUom !== uom) {
      throw new BomComponentInvalidError(
        c.componentItemId,
        `minPackUom (${minPackUom}) must equal qtyPerUnitUom (${uom})`,
      );
    }
    return {
      id: c.id,
      lineNo,
      componentItemId: c.componentItemId,
      componentSku: c.componentSku,
      qtyPerUnit: c.qtyPerUnit,
      qtyPerUnitUom: uom,
      scrapBasisPoints: scrap,
      yieldBasisPoints: yieldBp,
      minPack,
      minPackUom,
    };
  }

  static fromSnapshot(s: BomSnapshot): Bom {
    return new Bom(s);
  }

  activate(now: Date): Bom {
    if (this.s.isActive) return this;
    return new Bom({ ...this.s, isActive: true, updatedAt: now });
  }

  deactivate(now: Date): Bom {
    if (!this.s.isActive) return this;
    return new Bom({ ...this.s, isActive: false, updatedAt: now });
  }

  get componentItemIds(): readonly string[] {
    return this.s.components.map((c) => c.componentItemId);
  }

  snapshot(): BomSnapshot {
    return this.s;
  }
}
