# Business Rules R1–R10 — Traceability

The rules the user asked for in Phase 3, pinned to file:line and test names.
Update this file when code moves.

Legend: **file:line** is the production code that enforces the rule; **test** is
the name of the spec that would break if the enforcement disappeared.

| # | Rule (short) | Code | Test |
|---|---|---|---|
| R1 | State machine is one table; illegal transitions throw a typed domain error | `src/modules/production-order/domain/state-machine.ts` (`ALLOWED_TRANSITIONS`) enforced in `production-order.ts` (`transitionTo`) | `state-machine.spec.ts` — walks all 49 cells; `production-order.spec.ts` — throws `IllegalStatusTransitionError` |
| R2 | Amount above per-tenant threshold requires two distinct approvers | `production-order.ts` (`approve(actor, threshold)`) + `policies/approval-threshold.ts` | `production-order.spec.ts` — "requires a second approver above threshold"; `application/approve-order.spec.ts` — "second approver ≠ first" |
| R3 | Approver ≠ creator (SoD) enforced in domain | `production-order.ts` (`approve` guard) throws `SegregationOfDutiesError` | `production-order.spec.ts` — "creator cannot approve own order"; `application/approve-order.spec.ts` — "SoD blocked at domain even when policy allows" |
| R4 | Release fails with per-SKU shortage list when BOM cannot be reserved | `application/use-cases/release-order.ts` calls `InventoryPort.reserve` which returns `Either<MaterialShortage[], Reservation>` | `application/release-order.spec.ts` — "release rejects with per-SKU shortage list" |
| R5 | BOM computes required qty from scrap + yield with min-pack round-up; all integer math | `domain/bom/bill-of-materials.ts` (`computeRequired`) uses `Quantity` (bigint milli-unit) | `bill-of-materials.spec.ts` — "scrap 5% + yield 95% rounds up to min pack"; "no float leaks (bigint throughout)" |
| R6 | Due date computed from tenant factory calendar (working days, shifts, Thai holidays) | `application/ports/calendar.port.ts` interface consumed by `application/use-cases/release-order.ts` | `application/release-order.spec.ts` — "due date skips weekends and Songkran"; calendar contract tests |
| R7 | Every transition writes audit + emits domain event | `production-order.ts` (`transitionTo` appends to `pendingEvents`); `application/use-cases/*.ts` persist audit + event via outbox in same tx | `production-order.spec.ts` — "each transition appends one event"; `application/approve-order.spec.ts` — "audit and outbox written in same tx" |
| R8 | LINE notifications go through transactional outbox; worker retries idempotently with DLQ | `application/ports/outbox.port.ts` + `OutboxEventBus` + Phase 4 `OutboxLineWorker` | `application/approve-order.spec.ts` — "rollback emits no outbox rows"; Phase 5 worker e2e — "seven failures → DEAD row"; "retry with same idempotency key" |
| R9 | Progressive production report; sum > ordered × (1 + tolerance) is rejected | `production-order.ts` (`reportProgress`) + `policies/tolerance.ts` | `production-order.spec.ts` — "over-tolerance is rejected"; "cumulative crosses tolerance on third report" |
| R10 | Every query auto-scoped by tenantId via CLS; cross-tenant reach fails | `application/ports/tenant-context.ts` reads from CLS; Phase 4 Prisma `$extends` injects `where: { tenantId }`; repositories never accept a tenantId param | `application/tenant-scope.spec.ts` — "tenant A cannot fetch tenant B's order"; Phase 5 e2e — "same, over HTTP" |

## Cross-cutting invariants

| Invariant | Where | Why |
|---|---|---|
| No `new Date()` in `src/modules/*/domain/**` | Enforced by `no-restricted-syntax` eslint rule (Phase 3 patch below) and dep-cruiser (Phase 4) | Domain must be time-injectable to test R6 and R8 backoff |
| No `float` for money or quantity | `Money` and `Quantity` value objects use `bigint`; JSON boundary parses/formats | Rounding drift on money is a legal problem |
| Optimistic lock via `version int` (not `rowversion`) | `production-order.ts` carries `version`; repository update includes `where: { version: expected }` | ADR 0001 §4.1 — Prisma migrate breaks on `rowversion` |
| Domain never throws HTTP | Exception filter (Phase 4) maps `DomainError` subclass → HTTP code | Domain unaware of transport |

## Phase gate

- **Phase 3 (this):** Domain rules R1/R2/R3/R5/R7/R9 fully enforced in `domain/`; ports for R4/R6/R8/R10 defined in `application/`; use-case tests exercise them with in-memory adapters.
- **Phase 4:** Prisma models + `$extends` for R10; ConfigModule for per-tenant threshold R2; ExceptionFilter for domain → HTTP; nestjs-pino + terminus.
- **Phase 5:** testcontainers MSSQL + Redis for the R-concurrency 20-way e2e, LINE worker retry/DLQ e2e, cross-tenant e2e over HTTP.
