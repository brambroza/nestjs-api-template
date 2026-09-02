# Production Order — State Machine

Single source of truth for R1 (state machine as one table). Any transition not
listed here is forbidden and the domain layer throws `IllegalStatusTransitionError`.

The table is expressed in code at
`src/modules/production-order/domain/state-machine.ts`. This document mirrors it
by hand — the unit test `state-machine.spec.ts` walks every cell (allowed and
forbidden) so drift between doc and code is caught at test time.

## Transition table

Rows = current status. Columns = target status. Cell = who may drive it, plus
extra invariants checked in the same commit (see R-numbers → business-rules.md).

|  from ↓ / to →  | DRAFT | SUBMITTED | APPROVED | RELEASED | IN_PROGRESS | COMPLETED | CANCELLED |
|-----------------|:-----:|:---------:|:--------:|:--------:|:-----------:|:---------:|:---------:|
| **DRAFT**       |   —   | creator (R3 hint: creator is stamped here) |   ✗   |   ✗   |   ✗   |   ✗   | creator or planner |
| **SUBMITTED**   | creator (recall) | — | approver ≠ creator (R3) + threshold policy (R2) |   ✗   |   ✗   |   ✗   | approver or planner |
| **APPROVED**    |   ✗   | ✗ (re-submit not allowed; must CANCEL and re-DRAFT) | (second approver if two-level required by R2) | planner + BOM reserve success (R4/R5) |   ✗   |   ✗   | planner |
| **RELEASED**    |   ✗   |   ✗   |   ✗   |   —   | shop-floor lead (implicit on first `report-progress`) |   ✗   | planner (only if no progress reported) |
| **IN_PROGRESS** |   ✗   |   ✗   |   ✗   |   ✗   |   —   | shop-floor lead when qty produced ≥ qty ordered − shrinkage tolerance (R9) |   ✗   (in progress cannot be cancelled) |
| **COMPLETED**   |   ✗   |   ✗   |   ✗   |   ✗   |   ✗   |   —   |   ✗   |
| **CANCELLED**   |   ✗   |   ✗   |   ✗   |   ✗   |   ✗   |   ✗   |   —   |

Legend: **✗** = forbidden. **—** = identity transition, forbidden (no-op is not a transition).

## Notes on specific cells

- **DRAFT → SUBMITTED.** The user who submits becomes `createdBy` for the SoD check (R3). If the order was drafted by a different user, the submitter overrides — this is by design (a planner drafts on behalf of, then the operator submits). If a company wants stricter SoD they can override the policy port.
- **SUBMITTED → APPROVED.** Two guards fire in this exact order: (1) SoD — approver ≠ createdBy — enforced in `ProductionOrder.approve`; (2) R2 threshold — if total > `tenantConfig.dualApprovalThresholdSatang`, this transition needs a *second* approve call by a different approver. First approve moves to intermediate `APPROVED (pending 2nd)` — represented in code as `pendingSecondApprovalBy` not a distinct status, so the state table stays 7 states.
- **APPROVED → RELEASED.** Runs BOM calculation (R5: scrap/yield, round up to min pack). Calls `InventoryPort.reserve` — either success or `MaterialShortageError` carrying every missing SKU + required + available + shortage.
- **RELEASED → IN_PROGRESS.** Not driven by a user command; happens on the first successful `reportProgress` call.
- **IN_PROGRESS → COMPLETED.** Sum of `producedQty` ≥ `orderedQty × (1 − tolerance)` per R9. Over-report beyond `orderedQty × (1 + tolerance)` = `OverproductionError`.
- **CANCELLED** entry: only from DRAFT/SUBMITTED/APPROVED/RELEASED (and only from RELEASED if zero progress reported). IN_PROGRESS = too late.

## Authority matrix

Actor → transitions allowed:

| Role | Allowed transitions |
|------|-----|
| creator (of that order) | DRAFT→SUBMITTED, DRAFT→CANCELLED, SUBMITTED→DRAFT (recall while still not approved) |
| approver | SUBMITTED→APPROVED (only if ≠ createdBy, per R3), SUBMITTED→CANCELLED |
| planner | APPROVED→RELEASED, RELEASED→CANCELLED (no progress reported), APPROVED→CANCELLED |
| shop-floor lead | reportProgress (drives RELEASED→IN_PROGRESS and IN_PROGRESS→COMPLETED implicitly) |
| tenant admin | can override in the "admin close" flow — separate use case, out of Phase 3 |

The authority matrix is enforced by CASL policies at the application layer, not baked into `ProductionOrder`. The domain only enforces the R3 SoD invariant (approver ≠ creator) because that is a *domain* invariant — a company cannot turn it off with a role change.

## Traceability

- Code table: `src/modules/production-order/domain/state-machine.ts`
- Enforcement: `ProductionOrder.transitionTo(next, ...)` — the only mutator
- Tests: `src/modules/production-order/domain/state-machine.spec.ts` — walks all 7×7 = 49 cells

---

# Quotation — State Machine (EPIC-B.1)

Code: `src/modules/sales/quotation/domain/quotation.ts` (`TRANSITIONS`).
`quotation.spec.ts` exercises every allowed edge and the forbidden ones.

| from ↓ / to → | DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED | CANCELLED |
|---------------|:-----:|:----:|:--------:|:--------:|:-------:|:---------:|
| **DRAFT**     |   —   | sales (≥ 1 line, validUntil ≥ today) | ✗ | ✗ | ✗ | sales |
| **SENT**      |   ✗   |  —   | sales (today ≤ validUntil) | sales (+ reason) | nightly cron (validUntil < today) | sales |
| **ACCEPTED**  |   ✗   |  ✗   |    —     |    ✗     |    ✗    |     ✗     |
| **REJECTED**  |   ✗   |  ✗   |    ✗     |    —     |    ✗    |     ✗     |
| **EXPIRED**   |   ✗   |  ✗   |    ✗     |    ✗     |    —    |     ✗     |
| **CANCELLED** |   ✗   |  ✗   |    ✗     |    ✗     |    ✗    |     —     |

Notes

- **Revisions.** SENT / REJECTED / EXPIRED may be *revised*: a new row with the
  same `number`, `revision + 1`, status DRAFT and copied lines. The source row is
  never mutated (audit). Only the latest revision may be revised again.
- **Editing.** Header and lines change only in DRAFT; lines are re-priced from
  the current price lists on every edit (`PRICE_LIST`) unless a manual price is
  given (`MANUAL`, kept for audit).
- **Money.** All amounts are integer minor units; per-line half-up rounding for
  discount and VAT, header totals are the sum of the lines.
- **Concurrency.** `version` optimistic lock (ADR 0002 §6). Clients may send
  `expectedVersion`; a mismatch is `SALES.VERSION_CONFLICT` (409).
- **ACCEPTED → sales order.** The sales-order module links `salesOrderId`
  on conversion (next batch); a quotation converts at most once.

---

# Sales Order — State Machine (EPIC-B.2)

Code: `src/modules/sales/sales-order/domain/sales-order.ts` (`TRANSITIONS`).

| from ↓ / to →           | DRAFT | PENDING_APPROVAL | CONFIRMED | PARTIALLY_DELIVERED | DELIVERED | REJECTED | CANCELLED |
|-------------------------|:-----:|:----------------:|:---------:|:-------------------:|:---------:|:--------:|:---------:|
| **DRAFT**               |   —   | submit: a policy step applies (or credit EXCEEDED) | submit: auto-approved | ✗ | ✗ | ✗ | sales |
| **PENDING_APPROVAL**    | approval CANCELLED / withdrawn | — | approval APPROVED (`/confirm`) | ✗ | ✗ | approval REJECTED (`/confirm`) | sales |
| **CONFIRMED**           |   ✗   |        ✗         |     —     | delivery note SHIPPED (partial) | delivery note SHIPPED (all lines) | ✗ | sales, only while no line has been delivered |
| **PARTIALLY_DELIVERED** |   ✗   |        ✗         |     ✗     |          —          | delivery note SHIPPED (rest) | ✗ | ✗ |
| **DELIVERED**           |   ✗   |        ✗         |     ✗     |          ✗          |     —     |    ✗     |     ✗     |
| **REJECTED**            | `/reopen` |     ✗        |     ✗     |          ✗          |     ✗     |    —     |     ✗     |
| **CANCELLED**           |   ✗   |        ✗         |     ✗     |          ✗          |     ✗     |    ✗     |     —     |

Notes

- **Credit check (submit).** exposure = Σ totalMinor of the customer's orders in
  PENDING_APPROVAL / CONFIRMED / PARTIALLY_DELIVERED / DELIVERED (same currency)
  + this order. `creditStatus` = NOT_CHECKED (non-THB), NO_LIMIT (limit 0),
  OK, EXCEEDED. An EXCEEDED order that the approval matrix would auto-approve is
  refused (`SALES.CREDIT_LIMIT_EXCEEDED`); with a pending step it waits for a
  human who sees the flag.
- **Approval (pull model).** `submit` opens the request through
  `APPROVAL_GATEWAY` inside the same transaction; `/confirm` asks the gateway
  for the current state and applies it. No cross-module event bus is needed.
- **Delivery notes.** DRAFT → SHIPPED posts `deliveredQty` on the order lines
  in the same transaction (over-delivery = `SALES.OVER_DELIVERY`); DRAFT →
  CANCELLED discards. Shipped notes are immutable. Stock movement and
  reservation (T-213) arrive with Phase C inventory.
- **Quotation conversion.** `POST /sales-orders { quotationId }` copies the
  ACCEPTED quotation at its quoted prices and back-links `salesOrderId`; a
  quotation converts once.

---

# Procurement — State Machines (EPIC-B.3)

Code: `src/modules/purchase/procurement/domain/{requisition,purchase-order,goods-receipt}.ts`.

## Purchase requisition

| from ↓ / to →        | DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED | CONVERTED |
|----------------------|:-----:|:----------------:|:--------:|:--------:|:---------:|:---------:|
| **DRAFT**            |   —   | submit: a policy step applies | submit: auto-approved | ✗ | requester | ✗ |
| **PENDING_APPROVAL** | approval withdrawn | — | approval APPROVED (`/confirm`) | approval REJECTED (`/confirm`) | requester | ✗ |
| **APPROVED**         |   ✗   |        ✗         |    —     |    ✗     | requester | `POST /purchase-orders { requisitionId }` |
| **REJECTED**         | `/reopen` |    ✗         |    ✗     |    —     |     ✗     |     ✗     |
| **CANCELLED** / **CONVERTED** | ✗ | ✗ | ✗ | ✗ | — | — |

Approval runs against `PURCHASE_REQUISITION` with the **estimated** total; the
PO carries the real prices and is approved again against `PURCHASE_ORDER`.

## Purchase order

| from ↓ / to →          | DRAFT | PENDING_APPROVAL | ISSUED | PARTIALLY_RECEIVED | RECEIVED | REJECTED | CANCELLED |
|------------------------|:-----:|:----------------:|:------:|:------------------:|:--------:|:--------:|:---------:|
| **DRAFT**              |   —   | submit: a policy step applies | submit: auto-approved | ✗ | ✗ | ✗ | buyer |
| **PENDING_APPROVAL**   | approval withdrawn | — | approval APPROVED (`/confirm`) | ✗ | ✗ | approval REJECTED | buyer |
| **ISSUED**             |   ✗   |        ✗         |   —    | goods receipt POSTED (partial) | goods receipt POSTED (all) | ✗ | buyer, only while nothing received |
| **PARTIALLY_RECEIVED** |   ✗   |        ✗         |   ✗    |         —          | goods receipt POSTED (rest) | ✗ | ✗ |
| **RECEIVED**           |   ✗   |        ✗         |   ✗    |         ✗          |    —     |    ✗     |     ✗     |
| **REJECTED**           | `/reopen` |    ✗         |   ✗    |         ✗          |    ✗     |    —     |     ✗     |
| **CANCELLED**          |   ✗   |        ✗         |   ✗    |         ✗          |    ✗     |    ✗     |     —     |

## Goods receipt

DRAFT → POSTED (posts `receivedQty` on the PO lines in the same transaction;
over-receipt = `PURCHASE.OVER_RECEIPT`), DRAFT → CANCELLED. Posted receipts are
immutable. LOT-tracked items must carry a `lotNumber` (expiry optional); the
receipt records the warehouse so Phase C inventory can turn it into stock
movements without re-keying.

---

# Inventory — Ledger Rules (EPIC-C.1)

Code: `src/modules/inventory/application/stock-ledger.service.ts` (the only
writer) and `domain/{balance,costing,lot,serial,transfer}.ts` (pure rules).

- **Ledger.** `inv_stock_movement` is append-only; `inv_stock_balance` is its
  projection per (warehouse, item, lot). Types: RECEIPT, ISSUE, TRANSFER_OUT,
  TRANSFER_IN, ADJUST_IN, ADJUST_OUT, RESERVE, UNRESERVE. Quantity is always
  positive; the type carries the sign. Every movement writes an outbox event.
- **Invariants.** on-hand never negative; reserved never exceeds on-hand;
  available = on-hand − reserved. A document's own hold is consumed first when
  it issues (`consumeReservations`), so a confirmed sales order can always ship
  what it reserved.
- **Costing.** Tenant setting `costingMethod` = FIFO (one cost layer per receipt,
  consumed oldest first) or WEIGHTED_AVG (moving average per item). Issues carry
  `costMinor` for the GL (EPIC-C.4). Transfers ship at the source cost and
  re-layer at the destination.
- **Lots.** LOT items must name a lot on receipt (expiry defaults to receipt
  date + shelf life); issues without a lot allocate FEFO. The nightly sweep
  (00:15 Bangkok) alerts 30/7/1 days before expiry and once after.
- **Serials.** SERIAL items carry exactly one serial per unit on receipt and
  issue; a serial can be IN_STOCK, RESERVED, IN_TRANSIT or ISSUED, never in two
  warehouses.
- **Transfers.** DRAFT → IN_TRANSIT (ship) → RECEIVED; DRAFT → CANCELLED.
- **Integration.** Goods receipt POST → RECEIPT at the PO net unit cost;
  sales order CONFIRMED → RESERVE in the company's default warehouse (shortage
  = `SALES.STOCK_SHORTAGE`); delivery note SHIPPED → ISSUE consuming the hold;
  sales order CANCELLED → UNRESERVE; production order RELEASE → RESERVE via the
  gateway adapter (replaces the Phase 0 stub, T-328).

## Physical count (T-325)

DRAFT → COUNTING → REVIEW → POSTED; REVIEW → COUNTING (recount); DRAFT/COUNTING/REVIEW → CANCELLED.
The sheet freezes system quantities per (item, lot); variances are valued at the
item's average cost and go through the `STOCK_ADJUSTMENT` approval matrix.
`POST /inventory/counts/:id/post` applies the outcome: APPROVED posts ADJUST_IN /
ADJUST_OUT through the ledger (reference STOCK_COUNT), REJECTED sends the sheet
back to counting.

## Reorder point (T-326)

`pur_reorder_rule` per (warehouse, item). The nightly sweep (00:30 Bangkok,
one CLS scope per tenant, requester `system`) raises one purchase requisition
per (company, preferred vendor) for every active rule whose available quantity
is at or below the point, then holds that rule for a 7-day cooldown.

---

# Accounts Receivable (EPIC-C.2)

Code: `src/modules/finance/receivable/domain/{sales-invoice,receipt}.ts`.

## Sales invoice / tax invoice

DRAFT → ISSUED (gapless `IV<branch>-<yyyymm>-<nnnnn>` claimed inside the issuing
transaction, period gate on the invoice date) → PARTIALLY_PAID → PAID.
DRAFT | ISSUED (unsettled) → VOID. Credit notes (`CN…`) are issued and applied
to the original in one step (status APPLIED, never beyond the open balance);
debit notes (`DN…`) are new receivables referencing the original. Customer
identity (name, tax id, RD branch number, billing address) is frozen on the
document.

## Receipt

DRAFT → POSTED (allocations settle invoices; cash + withheld tax) → VOID
(reverses the settlements). Cheque receipts need number/bank/date; transfers
need the bank reference. `autoMatch` proposes allocations: quoted invoice
number → exact-amount match → oldest due first.

Reports: `/ar/aging` (0-30 / 31-60 / 61-90 / 90+ by days past due) and
`/ar/customers/:id/statement` (running balance). `/sales-invoices/:id/promptpay`
returns the EMVCo PromptPay payload for the open balance.

---

# Accounts Payable (EPIC-C.3)

Code: `src/modules/finance/payable/domain/{vendor-invoice,payment,three-way-match}.ts`.

## Vendor invoice

DRAFT → OPEN (post; the three-way match against the PO line price and the
received, un-invoiced quantity must be MATCHED, or the variance is explicitly
accepted with `acceptVariance`) → PARTIALLY_PAID → PAID; DRAFT | OPEN → VOID.
WHT-bearing lines carry the WHT tax code (rate, PND form, income type) but no
tax is deducted until payment.

## Payment voucher / batch

Voucher DRAFT → POSTED → VOID. Posting settles the invoices by the gross
allocation, withholds WHT on the paid share of each invoice's WHT base
(pro-rated on partial payments), pays the net, and issues one WHT certificate
(`WHT-yyyymm-nnnn`, PND3 / PND53 from the tax code) per voucher with WHT.
Voiding reverses the settlements and voids the certificate. A batch groups
draft vouchers (or generates one per vendor for everything due) and posts or
voids them together; vouchers in a batch are paid through the batch.

Reports: `/ap/aging` and `/ap/cash-forecast` (open payables by due week).

---

# General Ledger (EPIC-C.4)

Code: `src/modules/finance/ledger/domain/{journal-entry,posting-rules,reports}.ts`.

## Journal entry

Automatic entries (AR invoice / receipt, AP invoice / payment, inventory
movement, year-end close) are created and POSTED in the source document's
transaction through `LEDGER_POSTING` — the only ledger surface other modules
see. Each carries a `sourceKey` (`ar-invoice:<id>:issued`, `inventory:<movementId>`
…) so a replay is a no-op, and a void reverses every POSTED entry of the source
with a mirror entry instead of editing anything.

Manual journal vouchers (`JV-yyyymm-nnnn`): DRAFT → PENDING_APPROVAL
(`JOURNAL_ENTRY` policy on the debit total; no matching step posts at once)
→ POSTED (period gate on the entry date) → REVERSED (mirror entry, any
later date). DRAFT | PENDING_APPROVAL → VOID. A rejected approval returns
the entry to DRAFT. Posted entries are never edited or deleted.

## Posting keys (T-351)

Sub-ledgers post against keys, resolved per company through
`fin_account_mapping` (`PUT /gl/account-mappings`): AR_CONTROL, AP_CONTROL,
OUTPUT_VAT, INPUT_VAT, WHT_PAYABLE, WHT_RECEIVABLE, SALES_REVENUE,
PURCHASE_EXPENSE, CASH, BANK, INVENTORY, COGS, GRNI, INVENTORY_ADJUSTMENT,
RETAINED_EARNINGS. A missing mapping fails the posting (409
`GL.ACCOUNT_MAPPING_MISSING`) — and with it the invoice, receipt or stock
movement, since they share the transaction.

| Event | Debit | Credit |
| --- | --- | --- |
| Tax invoice / debit note issued | AR_CONTROL (customer) | SALES_REVENUE, OUTPUT_VAT |
| Credit note issued | SALES_REVENUE, OUTPUT_VAT | AR_CONTROL (customer) |
| Receipt posted | CASH or BANK, WHT_RECEIVABLE | AR_CONTROL (customer) |
| Vendor invoice posted | GRNI (PO-backed) or PURCHASE_EXPENSE, INPUT_VAT | AP_CONTROL (vendor) |
| Payment voucher posted | AP_CONTROL (vendor) | WHT_PAYABLE, CASH or BANK |
| Stock receipt | INVENTORY | GRNI |
| Stock issue | COGS | INVENTORY |
| Stock adjustment in / out | INVENTORY / INVENTORY_ADJUSTMENT | INVENTORY_ADJUSTMENT / INVENTORY |
| Year-end close | every P&L account with a credit balance… | …and RETAINED_EARNINGS takes the net |

Transfers and reservations move nothing in the GL.

## Period close (T-352)

`POST /gl/periods/close` refuses while any DRAFT / PENDING_APPROVAL entry is
dated inside the period, then locks it through master-data (reversible with a
reason via the fiscal-year API). `POST /gl/fiscal-years/:id/close` requires the
whole year posted, writes the closing entry dated the last day (this one entry
bypasses the period gate), locks the remaining periods and closes the year —
re-running it is idempotent.

Reports: `/gl/trial-balance` (opening / movements / closing per account,
`balanced` flag), `/gl/profit-and-loss`, `/gl/balance-sheet` (P&L accounts not
yet closed show as `currentEarningsMinor`). All amounts come from
POSTED / REVERSED lines only.

---

# Thai tax exports (EPIC-C.5)

Code: `src/modules/finance/tax/domain/{pp30,pnd,vat-report,csv}.ts`.

Read-only over AR / AP / WHT tables, per company and tax month
(`?companyId&month=YYYY-MM&format=json|csv`); CSV is UTF-8 with BOM so Thai
Excel opens it directly, dates are dd/mm/พ.ศ.

- `/tax/vat-report?kind=OUTPUT|INPUT` — รายงานภาษีขาย / ภาษีซื้อ, one row per
  issued tax invoice (credit notes negative) or posted vendor invoice.
- `/tax/pp30` — ภ.พ.30 items 1, 5, 6, 7, 8, 9 from the two VAT reports.
- `/tax/pnd?form=PND3|PND53` — ภ.ง.ด.3 / ภ.ง.ด.53 attachment rows from the
  WHT certificates issued by payment vouchers (void certificates excluded).

Not in this template: e-Tax Invoice XML signing (T-362), the archive
service (T-363), cash-flow statement (T-356) and bank reconciliation (T-357).
