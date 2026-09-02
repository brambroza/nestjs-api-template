# Business Rules R1–R10 — Traceability

The rules the user asked for in Phase 3, pinned to file:line and test names.
When a file moves, run `git grep -n <symbol>` and update this table.

Legend: **file:line** is the production code that enforces the rule; **test**
is the spec that would break if enforcement disappeared.

| # | Rule (short) | Code (file:line) | Test (file — key `it`) |
|---|---|---|---|
| R1 | State machine is one table; illegal transitions throw a typed domain error | `src/modules/production-order/domain/state-machine.ts:14` (`ALLOWED_TRANSITIONS`), enforced by `src/modules/production-order/domain/production-order.ts:384` (`assertCanTransition`) | `state-machine.spec.ts` — walks all 49 cells; `production-order.spec.ts` — "throws IllegalStatusTransitionError when DRAFT.approve is attempted" |
| R2 | Amount above per-tenant threshold requires two distinct approvers | `production-order.ts:226` (`approve` — dual approval branch); policy at `domain/policies/approval-threshold.ts:12` (`SimpleThresholdPolicy`); adapter reads per-tenant threshold at `infrastructure/persistence/prisma-tenant-threshold.ts` | `production-order.spec.ts` — "with total above threshold, one approval does not transition; two distinct do"; `approve-order.use-case.spec.ts` — "R2: dual approval requires two distinct approvers" |
| R3 | Approver ≠ creator (SoD) enforced in domain, not policy | `production-order.ts:233` (`if (actor === this.createdBy) throw new SegregationOfDutiesError`) | `production-order.spec.ts` — "rejects when the actor is the createdBy"; `approve-order.use-case.spec.ts` — "R3: creator cannot approve own order — domain error propagates, tx rolls back" |
| R4 | Release fails with per-SKU shortage list when BOM cannot be reserved | `application/use-cases/release-order.use-case.ts:56` (`inventory.reserve`); `application/ports/inventory.port.ts:32` (`InventoryPort`); `infrastructure/persistence/prisma-inventory.ts` (real adapter) | `release-order.use-case.spec.ts` — "rejects with a per-SKU shortage list when stock is insufficient" |
| R5 | BOM = ordered × perUnit × (1 + scrap) / yield, ceil, then ceil to minPack; all bigint | `domain/bom/bill-of-materials.ts:53` (`computeRequired`) using `Quantity` (bigint), `Money` (bigint) | `bill-of-materials.spec.ts` — "with 5% scrap and 95% yield rounds up to the next minPack"; "never introduces a float — output value is exactly a bigint multiple of minPack" |
| R6 | Due date computed from tenant factory calendar (working days, shifts, Thai holidays) | `application/ports/calendar.port.ts` (`CalendarPort`), stub `infrastructure/persistence/calendar-stub.ts` (weekends only). Real tenant_calendar model at `prisma/schema.prisma` (TenantCalendar). PHASE 5 gap: production replacement + Thai holiday seed | (Phase 5 gap — planned e2e "due date skips weekends and Songkran") |
| R7 | Every transition writes audit + emits domain event | `production-order.ts` mutators append events to `pendingEvents`; `application/use-cases/persistence.ts` (`persistAndDispatch`) writes them to outbox in the SAME tx as save. The outbox row IS the audit trail (`prisma/schema.prisma` OutboxMessage), keyed by (tenantId, aggregateId, occurredAt). | `production-order.spec.ts` — "submit, approve, release each append exactly one event to pendingEvents"; `approve-order.use-case.spec.ts` — "single-approver path: writes save + outbox in one committed transaction" |
| R8 | LINE via transactional outbox; worker retries idempotently with DLQ | Write: `modules/production-order/infrastructure/persistence/prisma-outbox.ts` (inserts row IN THE SAME tx). Dispatch: `modules/notification/application/outbox-dispatcher.service.ts:32` (`OutboxDispatcher`), `application/outbox-dispatcher.service.ts:94` (backoff via `domain/backoff.ts:11` `nextDelayMs`). LINE Retry-Key: `infrastructure/line-messaging.adapter.ts` (`x-line-retry-key` header). Cron: `infrastructure/outbox-worker.cron.ts` | `approve-order.use-case.spec.ts` — "R8 rollback: if outbox.enqueue throws, save is rolled back too"; `outbox-dispatcher.service.spec.ts` — 7 dispatcher tests including "sends the same idempotency key on the retry after a transient failure" and "exhausted attempts moves the row to DEAD"; `backoff.spec.ts` — locks the 30s -> 24h -> DEAD table |
| R9 | Progressive production report; cumulative > ordered × (1 + tolerance) rejected; ≥ floor auto-completes | `production-order.ts:295` (`reportProgress`) + `domain/policies/tolerance.ts:38` (`overCeiling`), `tolerance.ts:52` (`completionFloor`) | `production-order.spec.ts` — "rejects reporting above ordered × (1 + overBp / 10000)"; "cumulative crosses ceiling on third report -> rejected, prior reports retained"; "completion floor with underBp 100 (1% under) closes at 99/100" |
| R10 | Every query auto-scoped by tenantId via CLS; cross-tenant reach fails | Repo: `infrastructure/persistence/prisma-production-order.repository.ts` (`findFirst({ where: { id, tenantId } })` where tenantId comes from CLS via `ClsTenantContextService`); write path also uses `entity.tenantId` in the where. In-memory fake: `application/testing/in-memory.repository.ts` mirrors the same rule so unit tests exercise it. | `approve-order.use-case.spec.ts` — "R10: cross-tenant reach returns not-found (tenant A cannot approve tenant B order)" |

## Cross-cutting invariants

| Invariant | Where | Test / Enforcement |
|---|---|---|
| Optimistic lock via `version INT` (not MSSQL rowversion) | `production-order.ts:83` (`readonly version: number`); `prisma-production-order.repository.ts` (updateMany + `where.version = expected`, throws `OptimisticLockError` on count=0) | `approve-order.use-case.spec.ts` — "concurrency (R-concurrency): 20 simultaneous approve calls — exactly one succeeds, the other 19 fail with OptimisticLockError, exactly one outbox row is written" |
| No `new Date()` in `src/modules/*/domain/**` | Enforced by eslint `no-restricted-syntax` in `eslint.config.mjs` (spec files exempted) | eslint fails on any violation |
| No `process.env` outside `src/shared/config` | Enforced by eslint `no-restricted-syntax`; verified with grep in Phase 5 verify | `grep -RIn "process\\.env" src` returns only `src/shared/config/` files |
| Domain never throws HTTP | `DomainExceptionFilter` (`src/shared/errors/domain-exception.filter.ts:29`) maps `DomainError.code` -> HTTP; ban enforced with `grep -RIn "HttpException" src/modules/*/{domain,application}` | grep must return empty |
| No `any`, no `!`, no `@ts-ignore` | Enforced by eslint (`@typescript-eslint/no-explicit-any: error`, `no-non-null-assertion: error`, `ban-ts-comment: error`) | `grep -RIn ": any" src test` must return empty |
| No `forwardRef()` — signals bad module boundary | User's rule: stop and ask if needed | `grep -RIn "forwardRef" src` must return empty |
| Layer boundaries (domain <- application <- api/infrastructure) | `.dependency-cruiser.cjs` (7 rules) | `npm run arch:check`; also enforced in `src/shared/testing/architecture.spec.ts` |

## Phase gate — what shipped vs. what's a stub

- **Phase 3:** R1, R2, R3, R5, R7, R9 fully in `domain/`; ports for R4/R6/R8/R10 in `application/`; use-case tests with in-memory adapters prove R3/R4/R8/R10/concurrency.
- **Phase 4:** Prisma-backed adapters land the R7+R8 outbox writes in real tx; ExceptionFilter maps domain codes to HTTP; per-tenant threshold and tolerance flow from Tenant table; HTTP controllers with CASL policies and 3-layer DTOs.
- **Phase 5:** LINE Retry-Key idempotency worker with 7-attempt exponential backoff to DEAD; docker-compose + Prisma migration + seed for `docker compose up && npm run db:migrate && npm run db:seed && npm run start:dev`. Testcontainers-based e2e suite spec is a Phase 5 gap (documented in README) because docker daemon was unavailable in the authoring environment.

## Known stubs (readable but meant to be replaced)

- `JwtAuthGuard` reads `X-User-Id / X-Tenant-Id / X-Roles` headers. Replace with real passport-jwt in production.
- `WeekdayOnlyCalendar` skips Sat/Sun only — R6 real implementation reads `tenant_calendar` for Thai public holidays and shifts.
- `PrismaInventory` is minimum-viable single-row stock ledger. Real ERP hook goes here.
- `master-data` module is scaffold-only. Expand with tenant/BOM/stock CRUD as your product needs.
