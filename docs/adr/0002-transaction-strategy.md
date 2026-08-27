# ADR 0002 — Transaction Strategy (CLS-propagated Prisma extension)

Status: **Accepted (design)** — implementation lands in Phase 4 (Prisma wiring)
Date: 2026-08-27
Owner: brambroza
Depends on: [ADR 0001](0001-nest-stack.md) (Prisma + nestjs-cls chosen)

## 1. Problem

A single use case can touch several repositories (Order + Audit + Outbox in R7+R8 alone). All those writes must commit or rollback together. The template must not:

- pass a `tx` handle down through every function signature (unreadable)
- open a fresh transaction inside each repository (violates atomicity)
- rely on developers to remember to wrap things (they will forget)
- use `@nestjs/typeorm`-style REQUEST-scoped `EntityManager` (per ADR 0001 REQUEST scope is banned)

We also cannot use SQL Server `SET IMPLICIT_TRANSACTIONS ON` — Prisma manages its own transaction lifecycle.

## 2. Decision

**One `TransactionManager` service backed by CLS holds the current Prisma tx client.** Repositories always resolve their client through a getter that returns `cls.get(TX_KEY) ?? this.prisma`. That way:

- `TransactionManager.runInTransaction(work)` calls `prisma.$transaction(tx => cls.run({ [TX_KEY]: tx }, work))`.
- Every repository call inside `work` transparently uses `tx` — no parameter threading.
- Calls outside `runInTransaction` use the base `prisma` client (autocommit).

Concretely (Phase 4 will land the code — sketch here so we agree on shape):

```ts
// src/shared/database/transaction.manager.ts
export class TransactionManager {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async runInTransaction<T>(
    work: () => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number },
  ): Promise<T> {
    if (this.cls.get('tx')) {
      // Nested call → participate in the outer transaction; see §4
      return work();
    }
    return this.prisma.$transaction(
      async (tx) => this.cls.run({ tx, ...this.cls.get() }, work),
      { isolationLevel: options?.isolationLevel, timeout: options?.timeoutMs ?? 15_000 },
    );
  }
}

// src/modules/production-order/infrastructure/production-order.prisma-repository.ts
export class PrismaProductionOrderRepository implements ProductionOrderRepository {
  constructor(private readonly prisma: PrismaService, private readonly cls: ClsService<AppClsStore>) {}
  private client(): Prisma.TransactionClient { return this.cls.get('tx') ?? this.prisma; }
  async findById(id: OrderId) { return this.client().productionOrder.findUnique({ where: { id } }); }
}
```

## 3. Why CLS beats the alternatives (MSSQL context)

| Approach | Why not |
|---|---|
| Pass `tx` as function parameter | Every domain use case gains a `tx` argument it doesn't understand — leaks infrastructure into application signatures. |
| REQUEST-scoped `TransactionalManager` | Per ADR 0001, REQUEST scope cascades and doesn't reach cron/BullMQ worker. Outbox worker in R8 runs in BullMQ — can't use REQUEST. |
| Prisma middleware/extension only | Middleware runs per-query, doesn't own transaction lifetime. Fine for `where: { tenantId }` injection (see ADR 0004), wrong tool for atomicity. |
| `typeorm-transactional` package | Works for TypeORM only; we chose Prisma. |
| `@Transactional()` decorator | Same problem — needs an execution context. Under the hood any implementation for Prisma still uses CLS. Making it explicit means one obvious call site instead of hidden decorator magic. |

## 4. Nested transactions — the honest answer

SQL Server supports named savepoints (`SAVE TRANSACTION x`), but Prisma **does not expose savepoints** in its public API (as of Prisma 6.x). This means "nested transaction" has exactly three sane shapes and we pick #1:

1. **Participate (chosen).** Inner `runInTransaction` sees `cls.get('tx')` and simply executes `work()` inside the existing transaction. **No new tx is created, no savepoint is opened.** If the inner block throws, the outer catches it and the whole transaction rolls back. This matches how developers usually think about "the use case aborts" — partial rollback of only the inner work is almost never what the domain wanted.

2. **Reject.** Throw when `runInTransaction` is called reentrantly. Loud but forces every caller to know its transactional context.

3. **Fake it with savepoints.** Blocked by Prisma's public API. Would require raw `$executeRaw('SAVE TRANSACTION ...')` and manual `ROLLBACK TRANSACTION savepoint`. Rejected as premature — no use case in Phase 3 needs partial rollback.

**Rule that follows:** the *outermost* `runInTransaction` frame owns commit/rollback; inner frames may enter it but never own it. `TransactionManager` is the only class allowed to call `prisma.$transaction`.

## 5. Isolation & timeouts

- Default isolation: `ReadCommitted` (SQL Server default). Bump per use case, not globally.
- Approve/release use cases that update version-checked rows use `ReadCommitted` + `where: { version: expected }` — optimistic lock. See §6.
- Default statement timeout: **15 seconds** (Prisma's `timeout` option). External calls inside a transaction are still forbidden (see ADR 0003 outbox).

## 6. Optimistic locking (R-concurrency)

MSSQL `rowversion` is unusable through Prisma migrations (ADR 0001 §4.1 documents the open issue). We use an explicit `version int` column instead:

- Read: `findUnique` returns entity with `version`.
- Write: `update({ where: { id, version: expected }, data: { …, version: expected + 1 } })`.
- `updatedRows === 0` → throw `OptimisticLockError`.
- Exception filter maps that to HTTP 409.

R-concurrency e2e test (Phase 5): fire 20 concurrent approve requests against the same order; assert exactly one succeeds, nineteen get 409, audit has exactly one row.

## 7. Testability

`TransactionManager` gets an in-memory adapter (`InMemoryTransactionManager`) in `shared/testing`. Application use-case tests use it directly — no Prisma required. Domain tests never see it (domain code doesn't know transactions exist).

## 8. What this ADR does NOT do

- It does not attempt distributed transactions across DB + LINE. That is the outbox pattern (ADR 0003).
- It does not attempt saga orchestration. Single-DB use cases are the target.
- It does not commit us to Prisma forever — the `TransactionManager` interface can back onto TypeORM's `EntityManager` if we swap.

## 9. Sources

- Prisma interactive transactions docs — `prisma.$transaction(async (tx) => …)` semantics
- nestjs-cls Transactional plugin — inspired the shape but we roll our own to keep it minimal
- Prisma issue: no public savepoint API — https://github.com/prisma/prisma/discussions (multiple)
- SQL Server SAVE TRANSACTION docs — Microsoft Learn
