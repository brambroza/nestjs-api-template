import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import {
  GlVersionConflictError,
  JournalEntry,
  POSTED_STATUSES,
  isAccountKey,
  isJournalEntryStatus,
  isJournalSourceType,
  type AccountMappingSnapshot,
  type AccountSum,
  type JournalEntrySnapshot,
  type JournalLineSnapshot,
  type JournalSourceType,
} from '../domain';
import type {
  AccountMappingRepository,
  JournalEntryRepository,
  JournalFilter,
  LedgerBalanceQuery,
} from '../application/ports';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface LineRow {
  id: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  debitMinor: bigint;
  creditMinor: bigint;
  description: string | null;
  partyType: string | null;
  partyId: string | null;
}
interface EntryRow {
  id: string;
  tenantId: string;
  companyId: string;
  number: string;
  entryDate: Date;
  description: string;
  sourceType: string;
  sourceId: string | null;
  sourceKey: string | null;
  currency: string;
  status: string;
  reversalOfId: string | null;
  reversedById: string | null;
  approvalRequestId: string | null;
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  version: number;
  createdBy: string;
  postedAt: Date | null;
  postedBy: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toEntry(r: EntryRow): JournalEntry {
  if (!isJournalEntryStatus(r.status))
    throw new Error(`journal entry ${r.id}: bad status ${r.status}`);
  if (!isJournalSourceType(r.sourceType))
    throw new Error(`journal entry ${r.id}: bad sourceType ${r.sourceType}`);
  const lines: JournalLineSnapshot[] = r.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    accountId: l.accountId,
    accountCode: l.accountCode,
    debitMinor: l.debitMinor,
    creditMinor: l.creditMinor,
    description: l.description,
    partyType: l.partyType,
    partyId: l.partyId,
  }));
  const s: JournalEntrySnapshot = {
    id: r.id,
    tenantId: r.tenantId,
    companyId: r.companyId,
    number: r.number,
    entryDate: toIsoDate(r.entryDate),
    description: r.description,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    sourceKey: r.sourceKey,
    currency: r.currency,
    status: r.status,
    reversalOfId: r.reversalOfId,
    reversedById: r.reversedById,
    approvalRequestId: r.approvalRequestId,
    totalDebitMinor: r.totalDebitMinor,
    totalCreditMinor: r.totalCreditMinor,
    version: r.version,
    createdBy: r.createdBy,
    postedAt: r.postedAt,
    postedBy: r.postedBy,
    voidedAt: r.voidedAt,
    lines,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  return JournalEntry.hydrate(s);
}

function headerData(s: JournalEntrySnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    entryDate: fromIsoDate(s.entryDate),
    description: s.description,
    sourceType: s.sourceType,
    sourceId: s.sourceId,
    sourceKey: s.sourceKey,
    currency: s.currency,
    status: s.status,
    reversalOfId: s.reversalOfId,
    reversedById: s.reversedById,
    approvalRequestId: s.approvalRequestId,
    totalDebitMinor: s.totalDebitMinor,
    totalCreditMinor: s.totalCreditMinor,
    createdBy: s.createdBy,
    postedAt: s.postedAt,
    postedBy: s.postedBy,
    voidedAt: s.voidedAt,
  };
}

@Injectable()
export class PrismaJournalEntryRepository implements JournalEntryRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<JournalEntry | null> {
    const r = await this.txm.getClient().journalEntry.findFirst({
      where: { id, tenantId },
      include: withLines,
    });
    return r ? toEntry(r) : null;
  }

  async findBySourceKey(
    tenantId: string,
    sourceKey: string,
  ): Promise<JournalEntry | null> {
    const r = await this.txm.getClient().journalEntry.findFirst({
      where: { tenantId, sourceKey },
      include: withLines,
    });
    return r ? toEntry(r) : null;
  }

  async listPostedForSource(
    tenantId: string,
    sourceType: JournalSourceType,
    sourceId: string,
  ): Promise<readonly JournalEntry[]> {
    const rows = await this.txm.getClient().journalEntry.findMany({
      where: {
        tenantId,
        sourceType,
        sourceId,
        status: 'POSTED',
        reversalOfId: null,
      },
      include: withLines,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toEntry);
  }

  async list(tenantId: string, f: JournalFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.companyId ? { companyId: f.companyId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.sourceType ? { sourceType: f.sourceType } : {}),
      ...(f.accountId ? { lines: { some: { accountId: f.accountId } } } : {}),
      ...(f.from || f.to
        ? {
            entryDate: {
              ...(f.from ? { gte: fromIsoDate(f.from) } : {}),
              ...(f.to ? { lte: fromIsoDate(f.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      client.journalEntry.findMany({
        where,
        include: withLines,
        orderBy: [{ entryDate: 'desc' }, { number: 'desc' }],
        skip: f.offset,
        take: f.limit,
      }),
      client.journalEntry.count({ where }),
    ]);
    return { items: rows.map(toEntry), total };
  }

  async countUnposted(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<number> {
    return this.txm.getClient().journalEntry.count({
      where: {
        tenantId,
        companyId,
        status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
        entryDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
    });
  }

  async create(e: JournalEntry): Promise<void> {
    const s = e.snapshot();
    await this.txm.getClient().journalEntry.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        ...headerData(s),
        version: s.version,
        createdAt: s.createdAt,
        lines: {
          create: s.lines.map((l) => ({
            id: l.id,
            tenantId: s.tenantId,
            lineNo: l.lineNo,
            accountId: l.accountId,
            accountCode: l.accountCode,
            debitMinor: l.debitMinor,
            creditMinor: l.creditMinor,
            description: l.description,
            partyType: l.partyType,
            partyId: l.partyId,
          })),
        },
      },
    });
  }

  /** Header only — lines are immutable once created. */
  async save(e: JournalEntry): Promise<JournalEntry> {
    const s = e.snapshot();
    const r = await this.txm.getClient().journalEntry.updateMany({
      where: { id: s.id, tenantId: s.tenantId, version: s.version },
      data: { ...headerData(s), version: s.version + 1 },
    });
    if (r.count !== 1) {
      const current = await this.findById(s.tenantId, s.id);
      throw new GlVersionConflictError(s.id, s.version, current?.version ?? -1);
    }
    return JournalEntry.hydrate({ ...s, version: s.version + 1 });
  }
}

@Injectable()
export class PrismaAccountMappingRepository implements AccountMappingRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async listForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<readonly AccountMappingSnapshot[]> {
    const rows = await this.txm.getClient().accountMapping.findMany({
      where: { tenantId, companyId },
      orderBy: { key: 'asc' },
    });
    const out: AccountMappingSnapshot[] = [];
    for (const r of rows) {
      if (!isAccountKey(r.key)) continue;
      out.push({
        id: r.id,
        tenantId: r.tenantId,
        companyId: r.companyId,
        key: r.key,
        accountId: r.accountId,
        accountCode: r.accountCode,
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      });
    }
    return out;
  }

  async upsert(m: AccountMappingSnapshot): Promise<void> {
    await this.txm.getClient().accountMapping.upsert({
      where: {
        tenantId_companyId_key: {
          tenantId: m.tenantId,
          companyId: m.companyId,
          key: m.key,
        },
      },
      update: {
        accountId: m.accountId,
        accountCode: m.accountCode,
        updatedBy: m.updatedBy,
      },
      create: {
        id: m.id,
        tenantId: m.tenantId,
        companyId: m.companyId,
        key: m.key,
        accountId: m.accountId,
        accountCode: m.accountCode,
        updatedBy: m.updatedBy,
      },
    });
  }
}

@Injectable()
export class PrismaLedgerBalanceQuery implements LedgerBalanceQuery {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async sumByAccount(
    tenantId: string,
    companyId: string,
    from: IsoDate | null,
    to: IsoDate,
  ): Promise<readonly AccountSum[]> {
    const rows = await this.txm.getClient().journalLine.groupBy({
      by: ['accountId'],
      where: {
        tenantId,
        entry: {
          companyId,
          status: { in: [...POSTED_STATUSES] },
          entryDate: {
            ...(from ? { gte: fromIsoDate(from) } : {}),
            lte: fromIsoDate(to),
          },
        },
      },
      _sum: { debitMinor: true, creditMinor: true },
    });
    return rows.map((r) => ({
      accountId: r.accountId,
      debitMinor: r._sum.debitMinor ?? 0n,
      creditMinor: r._sum.creditMinor ?? 0n,
    }));
  }
}
