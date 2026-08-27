# ADR 0003 — Transactional Outbox for LINE OA Notifications

Status: **Accepted (design)** — worker lands in Phase 4/5
Date: 2026-08-27
Owner: brambroza
Depends on: [ADR 0002](0002-transaction-strategy.md)

## 1. Problem

R8 says: on "รออนุมัติ" (SUBMITTED) and "อนุมัติแล้ว" (APPROVED), send a LINE OA push. R8 also says:

- The notification must not go out if the DB write rolled back.
- The notification must not be sent twice if the worker crashes and retries.
- If LINE's API is down for hours, we do not lose the message.

Two anti-patterns we will not use:

1. **Fire HTTP inside the transaction** — a slow LINE endpoint stalls the tx; a LINE 5xx that we retry inside the tx blows the timeout. Even if we wrap in try/catch, we have already sent the message on a rolled-back transaction.
2. **Fire HTTP after commit, in-process** — the process can crash between commit and send. Message lost, no record.

## 2. Decision

Write outbox rows in **the same transaction** as the domain state change. A BullMQ worker reads unpublished rows and delivers them. This is the standard "transactional outbox" pattern; the details below are what we commit to.

### 2.1 Table shape (Phase 4 will land the Prisma model)

```
outbox_message
├─ id                uuid   pk
├─ tenant_id         nvarchar(36)          not null    (indexed with status)
├─ aggregate_type    nvarchar(64)          not null    -- 'production_order'
├─ aggregate_id      nvarchar(64)          not null
├─ event_type        nvarchar(128)         not null    -- 'production_order.submitted'
├─ payload           nvarchar(max)         not null    -- JSON
├─ occurred_at       datetime2(3)          not null
├─ status            nvarchar(16)          not null    -- PENDING | DELIVERED | DEAD
├─ attempts          int                   not null default 0
├─ next_attempt_at   datetime2(3)          not null
├─ last_error        nvarchar(1024)        null
├─ idempotency_key   nvarchar(128)         not null unique
└─ created_at        datetime2(3)          not null
```

Indexes: `(status, next_attempt_at)` for the worker poller; `(tenant_id, aggregate_id)` for observability lookups.

### 2.2 Invariants

1. **Write path.** Every domain event that requires side effects is written to `outbox_message` inside the same `runInTransaction` block that produced it. No exceptions — the `EventBus` port's default implementation (`OutboxEventBus`) is the only wiring the application layer knows.
2. **No HTTP inside the tx.** Codebase-level: `no-http-in-tx` lint rule + code review; also enforced by the outbox interface — you cannot emit an event without landing a row.
3. **`idempotency_key` derivation.** For LINE it is `sha256(event_type + aggregate_id + version)`. Version comes from optimistic-lock column (ADR 0002 §6), so retries of the same domain transition never re-fire — but a new transition from the same order does.
4. **Worker exactly-once (effectively).** Worker reads PENDING rows with `next_attempt_at <= now`, marks them `IN_FLIGHT` via optimistic update (`update where status = 'PENDING' and version = v`), delivers, then flips to `DELIVERED`. Crash between deliver and flip = re-attempt; LINE receives the same `idempotency_key` and treats it as a duplicate (LINE Messaging API supports `X-Line-Retry-Key` header — the worker sets it to `idempotency_key`).
5. **Retries.** Exponential backoff: 30s, 2m, 10m, 1h, 6h, 24h → move to DEAD (`status = 'DEAD'`). BullMQ handles the backoff schedule; the outbox table is the source of truth for delivery state.
6. **Poisoned rows go to DEAD, not deleted.** Ops decides when to inspect + resubmit. There is a `/admin/outbox/dead` endpoint gated by admin role (Phase 4).

### 2.3 Worker shape

- Two BullMQ queues: `outbox-dispatch` (poller feeds it) and `outbox-line` (adapter-specific).
- Poller runs every 5s (`@nestjs/schedule` cron); worker is a BullMQ consumer.
- Poller filters `WHERE status = 'PENDING' AND next_attempt_at <= NOW()` limited to N rows per tick.
- On graceful shutdown, worker `.close()` awaits in-flight jobs; if a job is mid-delivery when SIGTERM arrives, BullMQ marks it stalled and the next lease picks it up. Combined with `idempotency_key`, no duplicate send.

## 3. Anti-patterns explicitly forbidden

- **Emitting from a listener that runs after tx commit** (Nest `@OnEvent` async): rollback + already-delivered gap.
- **Reading unpublished rows without status/lease**: two workers pick the same row.
- **Deleting delivered rows in the worker**: kills auditability. Keep them; a nightly job archives rows > 90 days to a slower table.
- **Payload = full ORM entity**: entity shape can change; store the event contract that the consumer signed up for. Freeze payload schemas; version them (`event_type` includes major version, e.g. `production_order.submitted.v1`).

## 4. What this ADR does NOT do

- It is not a general saga engine. If we ever need choreographed multi-service flows, that is a separate ADR.
- It does not solve message ordering across aggregates. Within one aggregate, `version` gives us order. Across aggregates, ordering is not guaranteed.
- It does not include Kafka/Redpanda/etc. LINE OA is the only external sink for now; adding a new sink = adding a new outbox worker + adapter, not another table.

## 5. Testing hooks (Phase 3 covers, Phase 5 confirms)

- **App test — happy path.** Approve a submitted order → assert one `outbox_message` row with correct `event_type` and payload.
- **App test — rollback.** Force the repository `save` to throw after the outbox is written → assert zero outbox rows persisted.
- **App test — same idempotency.** Approve the same order twice with the same version → the second call throws OptimisticLock; assert exactly one outbox row.
- **Worker test (Phase 5).** Simulate LINE 500 → row stays PENDING with `attempts++`. Simulate worker crash mid-deliver → next poll re-picks; assert LINE saw the same `idempotency_key` in both requests. Simulate 7 failures → row moves to DEAD.

## 6. Sources

- Chris Richardson, microservices.io — Transactional Outbox pattern
- LINE Messaging API — Retry-Key header (docs.developers.line.biz)
- BullMQ docs — job retention, stalled jobs, backoff strategies
