import { DomainError } from '../../../../shared/errors';

export class DuplicateUomCodeError extends DomainError {
  readonly code = 'MASTER_DATA.DUPLICATE_UOM_CODE';
  constructor(readonly uomCode: string) {
    super(`UoM code "${uomCode}" already exists in this tenant`);
  }
}

export class UomNotFoundError extends DomainError {
  readonly code = 'MASTER_DATA.UOM_NOT_FOUND';
  constructor(readonly uomId: string) {
    super(`UoM ${uomId} not found`);
  }
}

export class InvalidUomFieldError extends DomainError {
  readonly code = 'MASTER_DATA.INVALID_UOM_FIELD';
}

export interface UomDefinitionSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly baseUomCode: string | null;
  readonly conversionRatio: bigint;
}

export interface CreateUomProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly baseUomCode?: string | null;
  readonly conversionRatio?: bigint;
}

/**
 * A base unit is a row with `baseUomCode = null` and `conversionRatio = 1`.
 * A derived unit expresses "1 <this> = <ratio> × 10^-6 <base>" — the
 * bigint keeps integer math clean when 1 kg is stored as (KG, base=G,
 * ratio=1_000_000).
 */
export class UomDefinition {
  private constructor(private readonly s: UomDefinitionSnapshot) {}

  static create(props: CreateUomProps): UomDefinition {
    const code = props.code.trim();
    if (code.length === 0 || code.length > 16) {
      throw new InvalidUomFieldError(
        'code must be a non-empty string up to 16 characters',
      );
    }
    if (!/^[A-Za-z0-9_-]+$/.test(code)) {
      throw new InvalidUomFieldError(
        'code may contain letters, digits, underscore, dash',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 64) {
      throw new InvalidUomFieldError(
        'name must be a non-empty string up to 64 characters',
      );
    }
    const base = props.baseUomCode?.trim() ?? null;
    if (base !== null && base.length > 16) {
      throw new InvalidUomFieldError('baseUomCode must be <= 16 characters');
    }
    if (base === code) {
      throw new InvalidUomFieldError('baseUomCode must differ from code');
    }
    const ratio = props.conversionRatio ?? 1n;
    if (ratio <= 0n) {
      throw new InvalidUomFieldError('conversionRatio must be positive');
    }
    if (base === null && ratio !== 1n) {
      throw new InvalidUomFieldError(
        'base units (baseUomCode=null) must have conversionRatio=1',
      );
    }
    return new UomDefinition({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      baseUomCode: base,
      conversionRatio: ratio,
    });
  }

  static fromSnapshot(s: UomDefinitionSnapshot): UomDefinition {
    return new UomDefinition(s);
  }

  snapshot(): UomDefinitionSnapshot {
    return this.s;
  }
}
