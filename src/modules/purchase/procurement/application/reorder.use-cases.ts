import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  PurchaseRefInvalidError,
  needsReorder,
  validateReorderRule,
  type ReorderRuleSnapshot,
} from '../domain';

import {
  PURCHASE_REF_LOOKUP,
  type PurchaseRefLookup,
} from './ports/purchase-ref-lookup.port';
import {
  REORDER_RULE_REPOSITORY,
  STOCK_AVAILABILITY_LOOKUP,
  type ReorderRuleRepository,
  type StockAvailabilityLookup,
} from './ports/reorder.ports';
import { CreateRequisitionUseCase } from './requisition.use-cases';

export interface UpsertReorderRuleInput {
  readonly warehouseId: string;
  readonly itemId: string;
  readonly reorderPoint: bigint;
  readonly reorderQty: bigint;
  readonly preferredVendorId?: string | null;
  readonly isActive?: boolean;
}

@Injectable()
export class UpsertReorderRuleUseCase {
  constructor(
    @Inject(REORDER_RULE_REPOSITORY)
    private readonly rules: ReorderRuleRepository,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpsertReorderRuleInput): Promise<ReorderRuleSnapshot> {
    const tenantId = this.tenant.getTenantId();
    validateReorderRule(input);
    if (!(await this.refs.warehouseExists(tenantId, input.warehouseId))) {
      throw new PurchaseRefInvalidError(
        `warehouse ${input.warehouseId} does not exist or is inactive`,
      );
    }
    const item = await this.refs.findItem(tenantId, input.itemId);
    if (!item?.isActive)
      throw new PurchaseRefInvalidError(
        `item ${input.itemId} does not exist or is inactive`,
      );
    const vendorId = (input.preferredVendorId ?? '').trim() || null;
    if (
      vendorId &&
      !(await this.refs.findVendor(tenantId, vendorId))?.isActive
    ) {
      throw new PurchaseRefInvalidError(
        `vendor ${vendorId} does not exist or is inactive`,
      );
    }
    const existing = await this.rules.findByKey(
      tenantId,
      input.warehouseId,
      item.id,
    );
    const rule: ReorderRuleSnapshot = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      warehouseId: input.warehouseId,
      itemId: item.id,
      reorderPoint: input.reorderPoint,
      reorderQty: input.reorderQty,
      preferredVendorId: vendorId,
      isActive: input.isActive ?? true,
      lastTriggeredAt: existing?.lastTriggeredAt ?? null,
      createdAt: existing?.createdAt ?? this.clock.now(),
    };
    await this.rules.upsert(rule);
    return rule;
  }
}

@Injectable()
export class ListReorderRulesUseCase {
  constructor(
    @Inject(REORDER_RULE_REPOSITORY)
    private readonly rules: ReorderRuleRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}
  async execute(
    warehouseId: string | null,
  ): Promise<readonly ReorderRuleSnapshot[]> {
    return this.rules.list(this.tenant.getTenantId(), warehouseId);
  }
}

export interface ReorderSweepResult {
  readonly checked: number;
  readonly triggered: number;
  readonly requisitionNumbers: readonly string[];
}

/**
 * T-326. Evaluates every active rule of the CURRENT tenant (the cron
 * wraps each tenant in its own CLS context) and raises one purchase
 * requisition per (company, preferred vendor) for the rules that fire.
 */
@Injectable()
export class ReorderSweepUseCase {
  constructor(
    @Inject(REORDER_RULE_REPOSITORY)
    private readonly rules: ReorderRuleRepository,
    @Inject(STOCK_AVAILABILITY_LOOKUP)
    private readonly stock: StockAvailabilityLookup,
    @Inject(PURCHASE_REF_LOOKUP) private readonly refs: PurchaseRefLookup,
    private readonly createRequisition: CreateRequisitionUseCase,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<ReorderSweepResult> {
    const tenantId = this.tenant.getTenantId();
    const now = this.clock.now();
    const rules = await this.rules.list(tenantId, null);
    const groups = new Map<
      string,
      {
        companyId: string;
        vendorId: string | null;
        rules: ReorderRuleSnapshot[];
      }
    >();
    let checked = 0;
    for (const rule of rules) {
      if (!rule.isActive) continue;
      checked += 1;
      const available = await this.stock.availableQty(
        tenantId,
        rule.warehouseId,
        rule.itemId,
      );
      if (!needsReorder(rule, available, now)) continue;
      const companyId = await this.refs.findWarehouseCompany(
        tenantId,
        rule.warehouseId,
      );
      if (!companyId) continue;
      const key = `${companyId}|${rule.preferredVendorId ?? ''}`;
      const g = groups.get(key) ?? {
        companyId,
        vendorId: rule.preferredVendorId,
        rules: [],
      };
      g.rules.push(rule);
      groups.set(key, g);
    }
    const requisitionNumbers: string[] = [];
    let triggered = 0;
    for (const g of groups.values()) {
      const pr = await this.createRequisition.execute({
        companyId: g.companyId,
        purpose: `Auto reorder ${now.toISOString().slice(0, 10)}`,
        lines: g.rules.map((r) => ({
          itemId: r.itemId,
          quantity: r.reorderQty,
          suggestedVendorId: g.vendorId,
        })),
      });
      requisitionNumbers.push(pr.snapshot().number);
      for (const r of g.rules) {
        await this.rules.markTriggered(r.id, now);
        triggered += 1;
      }
    }
    return { checked, triggered, requisitionNumbers };
  }
}
