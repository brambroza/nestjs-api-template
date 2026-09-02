import type { ItemTaxOverrideSnapshot, TaxCode, TaxKind } from '../../domain';

export const TAX_CODE_REPOSITORY = Symbol('TAX_CODE_REPOSITORY');

export interface TaxCodeRepository {
  findById(tenantId: string, id: string): Promise<TaxCode | null>;
  findByCode(tenantId: string, code: string): Promise<TaxCode | null>;
  findDefault(tenantId: string, kind: TaxKind): Promise<TaxCode | null>;
  list(
    tenantId: string,
    opts: { readonly kind?: TaxKind | null; readonly activeOnly: boolean },
  ): Promise<readonly TaxCode[]>;
  create(taxCode: TaxCode): Promise<void>;

  findOverride(
    tenantId: string,
    itemId: string,
    kind: TaxKind,
  ): Promise<ItemTaxOverrideSnapshot | null>;
  upsertOverride(override: ItemTaxOverrideSnapshot): Promise<void>;
}
