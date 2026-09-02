import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { DomainError } from '../../../../shared/errors';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  ImportOutcome,
  ImportTooLargeError,
  Item,
  MAX_IMPORT_ROWS,
  isTrackingPolicy,
  type ImportReport,
  type ImportRowError,
  type ItemImportRow,
} from '../domain';

import {
  CATEGORY_LOOKUP,
  type CategoryLookup,
} from './ports/category-lookup.port';
import { ITEM_REPOSITORY, type ItemRepository } from './ports/item.repository';
import {
  UOM_CATALOG_LOOKUP,
  type UomCatalogLookup,
} from './ports/uom-catalog.port';

export interface ImportItemsInput {
  readonly rows: readonly ItemImportRow[];
  /** Validate and report only; never writes. */
  readonly dryRun?: boolean;
  /** Insert the valid rows even when some rows fail. Default: all-or-nothing. */
  readonly allowPartial?: boolean;
}

/**
 * T-126. Validation is done up front against three bulk lookups
 * (existing SKUs, UoM codes, category codes) so a 10k-row file costs a
 * handful of queries, not 30k. Every failure is reported per row; the
 * caller decides whether a partial load is acceptable. Inserts run in
 * one transaction so a mid-file DB error cannot leave half a sheet in.
 */
@Injectable()
export class ImportItemsUseCase {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly repo: ItemRepository,
    @Inject(UOM_CATALOG_LOOKUP) private readonly uom: UomCatalogLookup,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookup,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ImportItemsInput): Promise<ImportReport> {
    if (input.rows.length > MAX_IMPORT_ROWS) {
      throw new ImportTooLargeError(input.rows.length);
    }
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();

    const refs = await this.loadReferences(tenantId, input.rows);
    const errors: ImportRowError[] = [];
    const valid: Item[] = [];
    const seenInFile = new Set<string>();

    for (const row of input.rows) {
      const sku = row.sku.trim();
      const key = sku.toUpperCase();
      const fail = (message: string): void => {
        errors.push({ rowNumber: row.rowNumber, sku: sku || null, message });
      };

      if (sku.length === 0) {
        fail('sku is required');
        continue;
      }
      if (seenInFile.has(key)) {
        fail(`duplicate sku "${sku}" within the file`);
        continue;
      }
      seenInFile.add(key);
      if (refs.existingSkus.has(key)) {
        fail(`sku "${sku}" already exists`);
        continue;
      }
      const uomCode = row.defaultUomCode.trim();
      if (!refs.uomCodes.has(uomCode.toUpperCase())) {
        fail(`unknown uom "${uomCode}"`);
        continue;
      }
      let categoryId: string | null = null;
      const categoryCode = row.categoryCode?.trim() ?? '';
      if (categoryCode.length > 0) {
        const id = refs.categoryIds.get(categoryCode.toUpperCase());
        if (!id) {
          fail(`unknown category "${categoryCode}"`);
          continue;
        }
        categoryId = id;
      }
      const policyRaw = (row.trackingPolicy?.trim() ?? '').toUpperCase();
      const trackingPolicy = policyRaw.length === 0 ? 'NONE' : policyRaw;
      if (!isTrackingPolicy(trackingPolicy)) {
        fail(`trackingPolicy must be NONE, LOT or SERIAL (got "${policyRaw}")`);
        continue;
      }
      let shelfLifeDays: number | null = null;
      const shelfRaw = row.shelfLifeDays?.trim() ?? '';
      if (shelfRaw.length > 0) {
        if (!/^\d+$/.test(shelfRaw)) {
          fail(`shelfLifeDays must be a whole number (got "${shelfRaw}")`);
          continue;
        }
        shelfLifeDays = Number(shelfRaw);
      }

      try {
        valid.push(
          Item.create({
            id: randomUUID(),
            tenantId,
            sku,
            name: row.name,
            description: row.description,
            defaultUomCode: uomCode,
            categoryId,
            trackingPolicy,
            shelfLifeDays,
            now,
          }),
        );
      } catch (err) {
        fail(err instanceof DomainError ? err.message : 'invalid row');
      }
    }

    const totalRows = input.rows.length;
    const base = { totalRows, validRows: valid.length, errors };

    if (input.dryRun) {
      return { ...base, outcome: ImportOutcome.DryRun, insertedRows: 0 };
    }
    if (errors.length > 0 && !input.allowPartial) {
      return { ...base, outcome: ImportOutcome.Rejected, insertedRows: 0 };
    }
    if (valid.length > 0) {
      await this.tx.runInTransaction(() => this.repo.createMany(valid));
    }
    return {
      ...base,
      outcome:
        errors.length > 0 ? ImportOutcome.Partial : ImportOutcome.Imported,
      insertedRows: valid.length,
    };
  }

  private async loadReferences(
    tenantId: string,
    rows: readonly ItemImportRow[],
  ): Promise<{
    existingSkus: ReadonlySet<string>;
    uomCodes: ReadonlySet<string>;
    categoryIds: ReadonlyMap<string, string>;
  }> {
    const skus = distinct(rows.map((r) => r.sku));
    const uoms = distinct(rows.map((r) => r.defaultUomCode));
    const cats = distinct(rows.map((r) => r.categoryCode ?? ''));

    const [existing, uomFlags, categoryMap] = await Promise.all([
      skus.length > 0 ? this.repo.findBySkus(tenantId, skus) : [],
      Promise.all(
        uoms.map(
          async (code) =>
            [code, await this.uom.exists(tenantId, code)] as const,
        ),
      ),
      cats.length > 0
        ? this.categories.idsByCodes(tenantId, cats)
        : new Map<string, string>(),
    ]);

    return {
      existingSkus: new Set(
        existing.map((i) => i.snapshot().sku.toUpperCase()),
      ),
      uomCodes: new Set(
        uomFlags.filter(([, ok]) => ok).map(([code]) => code.toUpperCase()),
      ),
      categoryIds: new Map(
        [...categoryMap.entries()].map(([code, id]) => [
          code.toUpperCase(),
          id,
        ]),
      ),
    };
  }
}

function distinct(values: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v.trim();
    if (t.length > 0 && !seen.has(t.toUpperCase()))
      seen.set(t.toUpperCase(), t);
  }
  return [...seen.values()];
}
