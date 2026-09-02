import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DefaultTaxCodeExistsError,
  DuplicateTaxCodeError,
  InvalidTaxCodeFieldError,
  NoTaxCodeForKindError,
  TaxCode,
  TaxCodeNotFoundError,
  computeTaxMinor,
  type CreateTaxCodeProps,
  type ItemTaxOverrideSnapshot,
  type TaxKind,
} from '../domain';

import {
  FINANCE_REF_LOOKUP,
  type FinanceRefLookup,
} from './ports/finance-ref-lookup.port';
import {
  TAX_CODE_REPOSITORY,
  type TaxCodeRepository,
} from './ports/tax-code.repository';

@Injectable()
export class ListTaxCodesUseCase {
  constructor(
    @Inject(TAX_CODE_REPOSITORY) private readonly repo: TaxCodeRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: {
      readonly kind?: TaxKind | null;
      readonly activeOnly?: boolean;
    } = {},
  ): Promise<readonly TaxCode[]> {
    return this.repo.list(this.tenant.getTenantId(), {
      kind: input.kind ?? null,
      activeOnly: input.activeOnly ?? true,
    });
  }
}

export type CreateTaxCodeInput = Omit<
  CreateTaxCodeProps,
  'id' | 'tenantId' | 'now'
>;

@Injectable()
export class CreateTaxCodeUseCase {
  constructor(
    @Inject(TAX_CODE_REPOSITORY) private readonly repo: TaxCodeRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateTaxCodeInput): Promise<TaxCode> {
    const tenantId = this.tenant.getTenantId();
    const code = input.code.trim().toUpperCase();
    const [dup, currentDefault] = await Promise.all([
      this.repo.findByCode(tenantId, code),
      input.isDefault ? this.repo.findDefault(tenantId, input.kind) : null,
    ]);
    if (dup) throw new DuplicateTaxCodeError(code);
    if (currentDefault) {
      throw new DefaultTaxCodeExistsError(
        input.kind,
        currentDefault.snapshot().code,
      );
    }
    const taxCode = TaxCode.create({
      ...input,
      id: randomUUID(),
      tenantId,
      now: this.clock.now(),
    });
    await this.repo.create(taxCode);
    return taxCode;
  }
}

export interface SetItemTaxOverrideInput {
  readonly itemId: string;
  readonly kind: TaxKind;
  readonly taxCodeId: string;
  readonly reason?: string | null;
}

/** "This item is VAT-exempt" = override the item's VAT code with an EXEMPT one. */
@Injectable()
export class SetItemTaxOverrideUseCase {
  constructor(
    @Inject(TAX_CODE_REPOSITORY) private readonly repo: TaxCodeRepository,
    @Inject(FINANCE_REF_LOOKUP) private readonly refs: FinanceRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: SetItemTaxOverrideInput,
  ): Promise<ItemTaxOverrideSnapshot> {
    const tenantId = this.tenant.getTenantId();
    const [itemOk, taxCode] = await Promise.all([
      this.refs.itemExists(tenantId, input.itemId),
      this.repo.findById(tenantId, input.taxCodeId),
    ]);
    if (!itemOk) {
      throw new InvalidTaxCodeFieldError(
        `itemId "${input.itemId}" is not a known item`,
      );
    }
    if (!taxCode || !taxCode.snapshot().isActive) {
      throw new TaxCodeNotFoundError(input.taxCodeId);
    }
    if (taxCode.snapshot().kind !== input.kind) {
      throw new InvalidTaxCodeFieldError(
        `tax code ${taxCode.snapshot().code} is ${taxCode.snapshot().kind}, not ${input.kind}`,
      );
    }
    const reason = (input.reason ?? '').trim() || null;
    if (reason !== null && reason.length > 200) {
      throw new InvalidTaxCodeFieldError('reason must be <= 200 characters');
    }
    const existing = await this.repo.findOverride(
      tenantId,
      input.itemId,
      input.kind,
    );
    const override: ItemTaxOverrideSnapshot = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      itemId: input.itemId,
      kind: input.kind,
      taxCodeId: taxCode.snapshot().id,
      reason,
      createdAt: existing?.createdAt ?? this.clock.now(),
    };
    await this.repo.upsertOverride(override);
    return override;
  }
}

export interface ResolveTaxInput {
  readonly kind: TaxKind;
  readonly itemId?: string | null;
  /** When given, the tax amount is computed too. */
  readonly baseAmountMinor?: bigint | null;
}

export interface ResolvedTax {
  readonly taxCode: TaxCode;
  readonly source: 'ITEM_OVERRIDE' | 'DEFAULT';
  readonly baseAmountMinor: bigint | null;
  readonly taxMinor: bigint | null;
}

/** The single entry point documents call to price a line's VAT or WHT. */
@Injectable()
export class ResolveTaxUseCase {
  constructor(
    @Inject(TAX_CODE_REPOSITORY) private readonly repo: TaxCodeRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ResolveTaxInput): Promise<ResolvedTax> {
    const tenantId = this.tenant.getTenantId();
    let taxCode: TaxCode | null = null;
    let source: ResolvedTax['source'] = 'DEFAULT';

    if (input.itemId) {
      const override = await this.repo.findOverride(
        tenantId,
        input.itemId,
        input.kind,
      );
      if (override) {
        taxCode = await this.repo.findById(tenantId, override.taxCodeId);
        if (taxCode?.snapshot().isActive) source = 'ITEM_OVERRIDE';
        else taxCode = null;
      }
    }
    taxCode ??= await this.repo.findDefault(tenantId, input.kind);
    if (!taxCode) throw new NoTaxCodeForKindError(input.kind);

    const base = input.baseAmountMinor ?? null;
    return {
      taxCode,
      source,
      baseAmountMinor: base,
      taxMinor:
        base === null
          ? null
          : computeTaxMinor(base, taxCode.snapshot().rateBasisPoints),
    };
  }
}
