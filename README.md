# nestjs-api-template

Production NestJS API template with MSSQL, transactional outbox, LINE OA
notifications, CASL authorization, tenant scoping, and a documented
hexagonal layout. Everything is glued together via CLS instead of
REQUEST-scoped providers.

- **NestJS 11** on **Node 22 LTS** (24 LTS also supported)
- **Prisma 6** against **Microsoft SQL Server 2022**
- **nestjs-cls** for tenant / user / request context (per ADR 0001)
- **BullMQ** planned for parallel outbox workers (currently
  cron-driven per ADR 0003 §2.3)
- **CASL** for authorization; state-machine authority matrix in
  `docs/state-machine.md`
- **class-validator** DTOs + **zod** env schema (per ADR 0001 §3.5)
- **nestjs-pino** JSON logging + CLS mixin
- **testcontainers** for real DB/Redis in e2e

Everything the code does that is non-obvious is justified in
`docs/adr/`.

## 5-minute setup

Prerequisites: **Node 22 LTS**, **Docker** (for MSSQL + Redis).

```bash
# 1. Install deps
npm ci

# 2. Bring up MSSQL + Redis. The mssql-init side-container creates
#    the "nestjs_api_template" database once the server is healthy.
docker compose up -d
docker compose logs -f mssql-init | head   # wait for "1 rows affected"

# 3. Copy env and set your LINE credentials (or leave placeholders
#    for local — the outbox worker will just DEAD-letter its pushes).
cp .env.example .env

# 4. Apply migrations and generate the Prisma client
npm run db:generate
npm run db:migrate       # runs against DATABASE_URL from .env
npm run db:seed          # writes tenant-demo + demo order + BOM + stock

# 5. Start the API
npm run start:dev
```

Sanity checks:

- `curl http://localhost:3000/health` → 200 with heap status
- `curl http://localhost:3000/ready` → 200 with `database: up`
- Swagger UI at http://localhost:3000/docs

## Golden path (curl)

Every request needs three headers: an authenticated user, a tenant, and
a role list (the built-in `JwtAuthGuard` is header-driven — swap for
real passport-jwt in production). The seed writes `tenant-demo` and a
draft order `demo-order-1`; the walkthrough below drives it end-to-end.

```bash
BASE=http://localhost:3000
TENANT=tenant-demo
CREATOR="user-alice"
APPROVER="user-bob"
PLANNER="user-planner"
SHOPFLOOR="user-shopfloor"

# View the seeded draft
curl -sS "$BASE/production-orders/demo-order-1" \
  -H "X-User-Id: $CREATOR" -H "X-Tenant-Id: $TENANT" -H "X-Roles: creator" | jq

# Submit for approval
curl -sS -X POST "$BASE/production-orders/demo-order-1/submit" \
  -H "X-User-Id: $CREATOR" -H "X-Tenant-Id: $TENANT" -H "X-Roles: creator" | jq

# Approve (different user — R3 SoD blocks the creator)
curl -sS -X POST "$BASE/production-orders/demo-order-1/approve" \
  -H "X-User-Id: $APPROVER" -H "X-Tenant-Id: $TENANT" -H "X-Roles: approver" | jq

# Release — pulls RAW-A stock through the BOM
curl -sS -X POST "$BASE/production-orders/demo-order-1/release" \
  -H "X-User-Id: $PLANNER" -H "X-Tenant-Id: $TENANT" -H "X-Roles: planner" | jq

# Report progress
curl -sS -X POST "$BASE/production-orders/demo-order-1/progress" \
  -H "X-User-Id: $SHOPFLOOR" -H "X-Tenant-Id: $TENANT" -H "X-Roles: shopfloor" \
  -H "content-type: application/json" \
  -d '{"quantity":{"value":"100","uom":"pcs"}}' | jq
```

To verify the outbox is queuing messages:

```bash
docker exec -it nestjs-api-template-mssql \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
  -P 'LocalDev@P4ssw0rd!' -C \
  -d nestjs_api_template \
  -Q "SELECT eventType, status, attempts, idempotencyKey FROM outbox_message ORDER BY createdAt DESC;"
```

## Module layout

Feature-per-module with a hexagonal split. `dependency-cruiser` (npm
run arch:check) enforces the boundary — CI fails on any cross-layer
import.

```
src/
├── modules/
│   ├── production-order/
│   │   ├── domain/           pure TypeScript, no Nest, no Prisma
│   │   ├── application/      use cases + port interfaces
│   │   ├── infrastructure/   Prisma adapters, HTTP client adapters
│   │   ├── api/              controllers, DTOs, guards
│   │   └── production-order.module.ts
│   ├── master-data/          (scaffold; expand for BOM/tenant CRUD)
│   └── notification/         outbox dispatcher + LINE adapter
├── shared/
│   ├── auth/                 JwtAuthGuard stub + CASL AbilityFactory + PoliciesGuard
│   ├── cls/                  AsyncLocalStorage store, seeded per request
│   ├── clock/                Clock port (SystemClockService adapter lives in production-order)
│   ├── config/               zod env + registerAs namespaces
│   ├── database/             PrismaService + PrismaTransactionManager (ADR 0002)
│   ├── errors/               DomainError base + DomainExceptionFilter
│   ├── health/               terminus /health + /ready
│   ├── interceptors/         logging, timeout, class serializer
│   ├── logging/              nestjs-pino module + CLS mixin
│   └── validation/           global ValidationPipe
├── main.ts
└── app.module.ts
```

**Direction of imports** is one-way and enforced:
`domain <- application <- api / infrastructure`. Domain must not import
`@nestjs/common` HTTP surface or any ORM. See
`.dependency-cruiser.cjs`.

## Adding a new use case

1. Add a domain method to the aggregate (or a new aggregate under
   `<module>/domain/`). Write a unit test — no Nest, no ports.
2. If the use case needs a new side effect, declare a port interface
   under `<module>/application/ports/` with an injection Symbol.
3. Write the use case under `<module>/application/use-cases/`. Wrap
   any state change in `TransactionManager.runInTransaction` and
   call `persistAndDispatch` if you emit domain events (R7+R8).
4. Add the real adapter under `<module>/infrastructure/`.
5. Bind port -> adapter in `<module>/<module>.module.ts`.
6. If the use case needs an HTTP endpoint, add a controller under
   `<module>/api/` with request/response DTOs and a `@CheckPolicies`
   handler.
7. Update `docs/state-machine.md` and `docs/business-rules.md` if the
   change touches a rule.

## Documentation index

- `docs/state-machine.md` — the R1 transition table (7×7)
- `docs/business-rules.md` — R1–R10 → file:line → test name
- `docs/adr/0001-nest-stack.md` — stack choices (Prisma, CLS, ...)
- `docs/adr/0002-transaction-strategy.md` — CLS-propagated tx manager
- `docs/adr/0003-transactional-outbox.md` — outbox invariants + worker

## Testing

```bash
npm run typecheck    # tsc --noEmit strict
npm run lint         # eslint (bans process.env outside config, ": any", HttpException in domain/application, new Date() in domain)
npm run arch:check   # dependency-cruiser layer boundaries
npm test             # unit tests (no external services)
npm run test:e2e     # compile smoke; the testcontainers e2e is under test/e2e/
npm run build        # nest build
```

Domain coverage on `src/modules/production-order/domain/` runs at
~97% statements. See `docs/business-rules.md` for the R1-R10 mapping.

## What's shipped vs. what the caller must fill in

Shipped and working:
- Domain layer for production orders (R1, R2, R3, R5, R7, R9)
- Application layer with 6 use cases + `persistAndDispatch` invariant
- Prisma schema for MSSQL + repository/outbox/BOM/inventory adapters
- Transactional outbox writer + cron dispatcher + LINE Retry-Key
  idempotency
- HTTP controller + Swagger + CASL PoliciesGuard + Class serializer
- terminus health checks, graceful shutdown, pino JSON logs
- 100+ unit tests including concurrent-approve, rollback-no-outbox,
  cross-tenant blocked

Stubs that ship compiling and readable, meant to be replaced:
- `JwtAuthGuard` reads `X-User-Id / X-Tenant-Id / X-Roles` headers.
  Replace with real passport-jwt.
- `WeekdayOnlyCalendar` skips Sat/Sun only. Replace with a
  `tenant_calendar`-backed implementation for R6 (Thai public
  holidays + shifts).
- `PrismaInventory` is a minimal single-row stock ledger.
  Real ERP integration goes here.
- `master-data` module is scaffold-only. Expand with tenant + BOM
  + stock CRUD as your product needs.

## License

UNLICENSED (template — pick your own).
