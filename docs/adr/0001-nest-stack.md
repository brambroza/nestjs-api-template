# ADR 0001 — NestJS Production Stack (MSSQL, multi-tenant)

Status: **Proposed — รอเจ้าของ repo ยืนยัน**
Date: 2026-08-27
Owner: brambroza

## 1. Context

Template สำหรับใช้ในบริษัทจริง โดเมนตัวอย่าง = ใบสั่งผลิตโรงงาน, multi-tenant, DB = **Microsoft SQL Server**, มีการอนุมัติหลายชั้น, มี integration LINE OA (ต้อง outbox), มี background job. เป้าหมายคือใช้เป็นแม่แบบระยะยาว ไม่ใช่ demo

## 2. เวอร์ชันฐาน (ยืนยันจาก source ทางการ)

| ชิ้น | เวอร์ชันที่จะใช้ | แหล่ง |
|---|---|---|
| Node.js | **22.x LTS (Maintenance)** เป็น floor, **24.x LTS (Active)** เป็น recommended | nodejs.org/en/about/previous-releases (v24.20.0 และ v22.23.2 ปรากฏสถานะ LTS ณ 26 ส.ค. 2026) |
| NestJS | **11.2.3** (release 25 ส.ค. 2026, patch) | github.com/nestjs/nest/releases |
| TypeScript | 5.x ตามที่ nest-cli 11 ประกาศคู่มา | scaffold จริงตอน Phase 2 จะ pin เวอร์ชันที่ออกมา |

หมายเหตุ: `previous-releases` ระบุแค่ label `LTS` ทั้ง v24 และ v22 ไม่บอกตรง ๆ ว่าใครเป็น Active / Maintenance — จะยืนยันอีกครั้งจาก `nodejs.org/en/about/releases` ตอนกำหนด `engines.node` ใน package.json (Phase 2)

## 3. การตัดสินใจหลัก

### 3.1 ORM — ต้องรัน MSSQL ให้ได้จริง

| ตัวเลือก | สถานะ MSSQL | Migration | JSON | rowversion | ข้อจำกัดที่เจอ | สรุป |
|---|---|---|---|---|---|---|
| **Prisma** | **GA** สำหรับ SQL Server / Azure SQL (Prisma blog ประกาศ production ready), รองรับ SQL Server 2017+ | ใช้ `prisma migrate` ได้ปกติ เหมือน PostgreSQL แต่ต้องใส่ type annotation เอง (`@db.NVarChar`, `@db.Decimal`) | MSSQL ไม่มี native JSON type — Prisma docs บอกให้ใช้ NVARCHAR + built-in JSON functions ของ SQL Server (ไม่ได้ prisma type `Json` แบบ Postgres) | **ยังเป็น open issue** (prisma/prisma#15512): `prisma migrate` / `prisma db push` แปลง rowversion เป็น binary(8) ทำให้ใช้เป็น auto optimistic lock ไม่ได้ตรง ๆ | RESTRICT ใน FK ไม่รองรับ; UNIQUE มีข้อจำกัดบางเคส | **เลือกได้ แต่ optimistic lock ต้อง handroll คอลัมน์ `version int` เอง ห้ามพึ่ง rowversion** |
| **TypeORM** | รองรับผ่าน `mssql` driver (tedious) มานาน | Migration ใช้ได้ แต่ปัญหา migration:generate ตรวจ diff บน MSSQL ผิดพลาดหลายเคส (typeorm/typeorm#3075) และมี issue การสร้างตาราง migration ซ้ำ (typeorm/typeorm#3164) | ต้อง handroll เช่นกัน | ยืดหยุ่นกว่าเพราะเขียน SQL เองได้ทุกขั้น | Decorator-based, พอ entity โตแล้ว repository pattern ไม่ค่อย type-safe เท่า Prisma, ecosystem maintenance ต่ำลงเมื่อเทียบ 2–3 ปีก่อน | ตัวสำรอง — เลือกได้ถ้าอยากได้ Repository pattern แบบ classic แต่ต้องยอมรับ migration friction |
| **Drizzle** | **beta** สำหรับ MSSQL ตั้งแต่ 1.0.0-beta.2 (announcement ของ drizzle-team), ยังขาด RQBv2 | มี drizzle-kit สำหรับ MSSQL แล้ว | เขียน SQL ล้วนอยู่ dev ใกล้ SQL | ไม่มี issue ที่เห็นเทียบเท่ากับ Prisma แต่ก็ยังใหม่ | Ecosystem บน Nest ยัง thin กว่า Prisma มาก, ตัด ORM ที่ยังไม่ผ่านฐาน production ใน SQL Server สำหรับ **template ใช้ในบริษัทจริง** | **ตัดออก** — เหตุผล: บริษัทจริง ตกที่ beta = คุณจะเจอ workaround รายเดือน |

**Recommendation: Prisma**
- สาเหตุหลัก 3 ข้อ: (1) GA แล้วบน MSSQL (2) Migration tooling ทำงานได้จริง (3) Type-safety ระดับที่ทีมใหม่โตขึ้นได้เร็ว
- ราคาที่ต้องจ่าย: (a) ต้อง handroll optimistic lock ด้วย `version int` แทน rowversion (R-concurrency จะใช้ตัวนี้) (b) JSON column ต้อง type เป็น string + parse ที่ application layer หรือใช้ `@db.NVarChar(Max)` + validator (c) ต้องเขียน raw SQL สำหรับ query ที่ต้อง SQL Server hints (index hint, TABLOCKX)
- ถ้ายืนยัน "อยากได้ Repository pattern classic กว่านี้" → เปลี่ยนเป็น TypeORM ได้ **ต้องเลือกก่อน Phase 2 เท่านั้น** เปลี่ยนหลังจากนั้น = rewrite

### 3.2 Context propagation — CLS vs REQUEST-scoped

| ตัวเลือก | อยู่ที่ไหนได้ | Performance | ใช้กับ cron / queue consumer / websocket ได้มั้ย | ผลกระทบ |
|---|---|---|---|---|
| **REQUEST scope** | HTTP request เท่านั้น | Nest docs เตือนว่า instance ถูกสร้างใหม่ทุก request → เมื่อ inject provider request-scoped เข้า provider อื่น provider อื่นก็กลายเป็น request-scoped **แบบ cascading** ทั้งหมด (docs.nestjs.com/fundamentals/injection-scopes: "durability bubbles up the injection chain") | ไม่ได้ (cron/BullMQ consumer ไม่มี Request) — ต้อง handroll | latency แย่ลง (~5% ในเคสธรรมดา, มากกว่านั้นถ้า cascade ไปทั้งกราฟ) และ singleton cache ของ Nest ใช้ไม่ได้กับ subgraph นั้น |
| **nestjs-cls** (AsyncLocalStorage) | ทุกจุดที่ Node event loop เข้าถึงได้ (HTTP, cron, queue, WS, gRPC) | ค่า overhead ของ AsyncLocalStorage อย่างเดียว, ไม่ไป rebuild DI graph ต่อ request | ได้ทั้งหมด | จุดอ่อน: state ไม่ถูก type ผูกกับ constructor (ต้อง `cls.get('tenantId')`) — แก้ด้วยการ wrap เป็น `TenantContext.getTenantId()` มี type |

**Recommendation: nestjs-cls** เป็นหลัก
- ใช้ทั้ง tenantId / userId / requestId / transaction handle (สำคัญมากสำหรับ R8 outbox และ transaction manager ใน Phase 3)
- REQUEST scope ใช้เฉพาะ edge case ที่ **ต้อง** binding lifetime กับ request จริง ๆ (แทบไม่มีในโปรเจกต์นี้) — และต้องมี ADR เฉพาะ

### 3.3 Queue — BullMQ vs @nestjs/schedule เปล่า

- `@nestjs/schedule` เปล่า ๆ = cron ในกระบวนการเดียว **ไม่มี** retry, ไม่มี persistence, ไม่มี DLQ, restart ปุ๊บงานหาย → **ตัด**
- **BullMQ** รองรับ retry+backoff (exponential), DLQ pattern ผ่าน `failed` state + move-to-DLQ worker, delayed / repeatable jobs, และแนะนำ idempotency pattern ผ่าน jobId + unique constraint (BullMQ docs, dev.to/young_gao/background-job-processing-in-nodejs-bullmq)
- Storage: Redis 6+ (จะใส่ Redis เป็น dependency ของ template)

**Recommendation: BullMQ** — บังคับสำหรับ R8 (outbox worker ที่ยิง LINE)

### 3.4 Authorization — CASL vs custom policy guard

| ตัวเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **CASL** | ABAC ready, subject-scoped conditions (เช่น "อนุมัติได้ถ้า order.createdBy !== user.id" — ตรงกับ R3 พอดี), Prisma adapter มี | learning curve, runtime cost เมื่อ policy ซับซ้อน |
| **Custom policy guard** | ควบคุมทั้งหมด, ไม่มี runtime magic | R3 (SoD) และ R2 (per-tenant cap) จะกลายเป็น if-else รกใน service — ตรงกับที่ user ห้ามใน rules |

**Recommendation: CASL** — R3 คือ ABAC textbook case, custom guard จะกลายเป็นสิ่งที่ทีมเกลียดใน 6 เดือน

### 3.5 Validation DTO — class-validator vs zod

- **Swagger CLI plugin ของ Nest อ่าน metadata จาก class + decorator** (@ApiProperty, class-validator) เท่านั้น — ถ้าเลือก zod จะต้องใช้ `nestjs-zod` เป็น bridge สร้าง OpenAPI จาก `z.toJSONSchema` (มี lib จริงและ maintain อยู่)
- class-validator: standard NestJS, ไม่ต้องใช้ 3rd-party bridge, ทีมใหม่ onboarding ง่ายกว่า
- zod: single source of truth (schema เดียวใช้ทั้ง validate + infer type), แต่ Swagger generation ต้องรับ dependency `nestjs-zod` และเสี่ยงเรื่อง compatibility ทุกครั้งที่ Nest bump major

**Recommendation แบบผสม:**
- **DTO ของ HTTP API** → class-validator + class-transformer (Swagger ทำงานเต็ม, CLI plugin generate ให้)
- **Config schema (env)** → zod (บังคับ type env ตอน boot, ไม่เกี่ยวกับ Swagger)
- **Domain invariant** → ไม่ใช้ทั้งคู่ในชั้น domain (ต้องเป็น TS ล้วนตามกฎ Phase 2) — ใช้ value object + factory ที่ throw domain error

### 3.6 อื่น ๆ

| อะไร | เลือกอะไร | เหตุผลย่อ |
|---|---|---|
| Config validation | **zod** ผ่าน `ConfigModule.forRoot({ validate })` | typed, tree-shakeable, ไม่ต้อง decorator |
| Test container | **testcontainers-node** (มี MSSQL module พร้อม) + Redis module | e2e ต้องแตะ DB จริงตามกฎ Phase 5 |
| Logger | **nestjs-pino** | JSON output, redact PII, สามารถ enrich จาก CLS ได้ (tenantId, requestId) |
| Health | `@nestjs/terminus` | ตามกฎ Phase 4 |
| HTTP client (LINE) | `undici` + wrapper adapter (ไม่ให้ service รู้จัก axios ตรง ๆ) | ใช้ใน worker ไม่ใช่ใน request path |

## 4. สิ่งที่จะเจอแน่ ๆ ภายหลัง (บันทึกไว้ก่อน)

1. **Prisma + MSSQL rowversion** — ยืนยัน handroll `version int` เอง, ไม่แตะ rowversion ตลอด lifecycle template
2. **CLS + Prisma transaction** — ต้องเขียน `TransactionManager` เองที่เก็บ `PrismaClient | Prisma.TransactionClient` ลง CLS และให้ repository ทุกตัวอ่านผ่าน getter เดียว (มี ADR 0002 แยกใน Phase 3)
3. **BullMQ + graceful shutdown** — worker ต้อง drain ก่อน `enableShutdownHooks()` ปิด process จริง; มี ADR 0003 ในเฟสที่เกี่ยวข้อง
4. **Multi-tenant + Prisma middleware** — Prisma 5+ เปลี่ยนจาก `$use` middleware เป็น extension (`$extends`) — ต้องยืนยันอีกทีตอน scaffold ว่าจะใช้ extension pattern

## 5. สิ่งที่ **ตัดสินใจไปแล้ว** — ต้องการยืนยัน

- [ ] ORM = **Prisma** (ยอมรับข้อจำกัด rowversion, JSON via NVarChar, RESTRICT FK)
- [ ] Context = **nestjs-cls**, ไม่ใช้ REQUEST scope
- [ ] Queue = **BullMQ + Redis**
- [ ] Authz = **CASL**
- [ ] Validation DTO = **class-validator**; Config = **zod**
- [ ] Logger = **nestjs-pino**
- [ ] Test = **Jest + supertest + testcontainers (MSSQL + Redis)**
- [ ] Node = **22 LTS floor, 24 LTS recommended**; NestJS = **11.2.x**

ถ้าไม่โอเคข้อไหน บอกก่อน Phase 2 เพราะเปลี่ยนหลัง scaffold = ต้อง rewrite

## 6. Sources

- [Node.js Previous Releases](https://nodejs.org/en/about/previous-releases) — v24.20.0 LTS, v22.23.2 LTS (as of 26 ส.ค. 2026)
- [NestJS Releases (v11.2.3)](https://github.com/nestjs/nest/releases)
- [Prisma — Microsoft SQL Server GA blog](https://www.prisma.io/blog/prisma-microsoft-sql-server-azure-sql-production-ga)
- [Prisma — Microsoft SQL Server docs](https://www.prisma.io/docs/orm/overview/databases/sql-server)
- [Prisma — rowversion issue #15512](https://github.com/prisma/prisma/issues/15512)
- [TypeORM MSSQL driver](https://typeorm.io/docs/drivers/microsoft-sqlserver/)
- [TypeORM migration:generate mssql issue #3075](https://github.com/typeorm/typeorm/issues/3075)
- [Drizzle MSSQL get-started](https://orm.drizzle.team/docs/get-started-mssql)
- [Drizzle 1.0.0-beta.2 release](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2)
- [nestjs-cls](https://github.com/Papooch/nestjs-cls)
- [NestJS Injection Scopes](https://docs.nestjs.com/fundamentals/injection-scopes)
- [BullMQ docs (retry, DLQ, idempotency)](https://docs.bullmq.io/)
- [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod)
- [NestJS OpenAPI CLI plugin](https://docs.nestjs.com/openapi/cli-plugin)
- [CASL guide](https://casl.js.org/v6/en/guide/intro)
