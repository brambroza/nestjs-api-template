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
