import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DuplicateUomCodeError,
  InvalidUomFieldError,
  UomDefinition,
} from '../domain';

import { UOM_REPOSITORY, type UomRepository } from './ports/uom.repository';

export interface CreateUomInput {
  readonly code: string;
  readonly name: string;
  readonly baseUomCode?: string | null;
  readonly conversionRatio?: bigint;
}

@Injectable()
export class CreateUomUseCase {
  constructor(
    @Inject(UOM_REPOSITORY) private readonly repo: UomRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: CreateUomInput): Promise<UomDefinition> {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByCode(tenantId, input.code.trim());
    if (existing) {
      throw new DuplicateUomCodeError(input.code);
    }
    if (input.baseUomCode) {
      const base = await this.repo.findByCode(tenantId, input.baseUomCode);
      if (!base) {
        throw new InvalidUomFieldError(
          `baseUomCode "${input.baseUomCode}" is not a known UoM in this tenant`,
        );
      }
    }
    const uom = UomDefinition.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      baseUomCode: input.baseUomCode ?? null,
      conversionRatio: input.conversionRatio,
    });
    await this.repo.create(uom);
    return uom;
  }
}
