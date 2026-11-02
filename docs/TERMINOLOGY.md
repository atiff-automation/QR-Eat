# Terminology standard and inconsistency audit

**Status:** final · approved 2026-11-02
**Scope:** QR-Eat server/web, Tabtep Counter, Tabtep Station/Kitchen, receipts, reports, notifications, docs
**Purpose:** one user-facing vocabulary across web, Counter, kitchen/station, receipts, reports and docs
**Implementation:** Phase 1 label helpers complete. Screens are not wired yet; current UI still uses `Active`/`History` and `Not now` until Phases 2–4.
**Supersedes:** earlier page-specific status wording
**Rule:** the approved decisions in this document and the cross-surface plan override any conflicting historical recommendation in the audit tables.

## 1. Verdict

The backend enum names are consistent. The user-facing labels are **not**
consistent across the Counter, web POS, receipts, reports and docs.

The main risks are:

1. `PENDING` means both an order state and a payment state.
2. Counter status pills sometimes show raw enum values.
3. Table state, bill state and kitchen state are mixed in one badge.
4. Payment method labels differ by screen (`E-wallet`, `E-Wallet`, `ewallet`).
5. Orders use both `Ongoing`/`Done` and `Active`/`History`.
6. Web uses `Ready for Pickup` for dine-in orders.
7. Payment actions use `Pay`, `Record payment` and `Process Payment`.

Do not implement the bill update with a new vocabulary. Use this glossary.

## 2. Canonical glossary

### 2.1 Object names

| Concept | Use | Do not use |
|---|---|---|
| A table's current bill | **Bill** | Check, Tab, Session |
| The technical grouping of one sitting | **Dining session** | Table session in UI |
| A customer order/round | **Order** | Ticket for a customer order |
| A kitchen print artifact | **Kitchen ticket** | Order |
| A line in an order | **Item** | Product, line item |
| Money taken | **Payment** | Checkout, settlement |
| Proof after payment | **Receipt** | Bill |
| The bill before payment | **Bill** | Receipt |

Rules:

- Staff see **Bill**, never `DiningSession`.
- Code and API may use `DiningSession`; the UI uses **Bill**.
- Do not introduce `Check`; the app and docs already use Bill.
- Do not call a customer order a `ticket`. A ticket is the kitchen print job.

### 2.2 Order status labels

| Backend | UI label | Notes |
|---|---|---|
| `PENDING` | **Pending** | Incoming QR order waiting for confirmation |
| `CONFIRMED` | **Confirmed** | Confirmed, waiting for kitchen |
| `PREPARING` | **Preparing** | In the kitchen |
| `READY` | **Ready** | Detail may say Ready to serve / Ready for pickup |
| `SERVED` | **Served** | Delivered to the table/customer |
| `CANCELLED` | **Cancelled** | Double `l` |

Avoid:

- `Cooking` as a status. Use **Preparing**.
- `In progress` as a status pill. It is a filter/group name only.
- `Ready for Pickup` for dine-in orders.
- `Delivered` for a table order. Use **Served**.
- `Canceled` (US spelling).

### 2.3 Payment status labels

| Backend | UI label | Notes |
|---|---|---|
| `PENDING` | **Unpaid** | Never show Pending for payment |
| `PAID` | **Paid** | — |
| `REFUNDED` | **Refunded** | — |
| `FAILED` | **Failed** | — |

Rule:

> **Pending is an order state. Unpaid is a payment state.**

This is the most important terminology rule in the current app.

### 2.4 Payment methods

| Backend | UI label |
|---|---|
| `cash` | **Cash** |
| `card` | **Card** |
| `ewallet` | **E-Wallet** |

Use **E-Wallet** everywhere, including receipts and reports. Never print the raw
`ewallet` value.

### 2.5 State families

Do not mix these three families in one badge.

#### Table state

From `TableStatus`:

- **Available**
- **Occupied**
- **Reserved**
- **Inactive**

#### Bill state

Derived from payment and kitchen state:

- **Unpaid**
- **Paid**
- **Ready to clear**

#### Table attention state

- **TO SERVE** — food is ready and the table is waiting for service

This is a table-level derived state, not an order status.

#### Kitchen state

Customer/counter order states:

- **Pending**
- **Confirmed**
- **Preparing**
- **Ready**
- **Served** (dine-in) / **Picked up** (takeaway)
- **Cancelled**

Station ticket states:

- **QUEUED**
- **PREPARING**
- **READY**

Station item states:

- **QUEUED**
- **PREPARING**
- **DONE**

`NEW` on the Station means an unread ticket only. It is not a ticket or item
state.

Example table card:

```text
T1   OCCUPIED
1 preparing · 1 ready
Unpaid MYR 19.99
```

Not:

```text
T1   UNPAID
```

`Unpaid` is the bill state, not the table state.

### 2.6 Actions

| Action | Label | Notes |
|---|---|---|
| Open payment | **Pay** | Primary bill action |
| Confirm payment in sheet | **Record payment** | Covers cash/card/E-Wallet |
| Payment success | **Payment recorded** | Event, not a status |
| Free the table | **Clear table** | Only after paid and served |
| Stay on the table | **Keep table** | — |
| Add items | **Add order** | — |
| Print again | **Reprint receipt** | — |
| Dismiss a success pane | **Done** | Button only; the Counter list also uses Done |
| Start a kitchen item | **Start** | Station item action |
| Finish a kitchen item | **Mark done** | Never a bare Done |
| Finish a kitchen ticket | **Mark ready** | Station ticket action |
| Dismiss a confirmation | **Cancel** | Never bare Cancel for an order |
| Close an information sheet | **Close** | — |
| Cancel an order | **Cancel order** | Destructive action |

Avoid:

- `Process Payment` for a recorded cash/card/E-Wallet payment.
- `Payment successful` when the app only recorded an external payment.
- `Close bill` unless a separate close step is introduced.
- `COOKING` or `TO COOK` on the Station; use **PREPARING** and **QUEUED**.
- `Done` as a kitchen item action; use **Mark done**.
- A bare `Cancel` for an order action; use **Cancel order**.

### 2.7 Filters and lists

#### Table bill

Use:

```text
[ Open ] [ Served ] [ All ]
```

| Filter | Meaning |
|---|---|
| **Open** | Not cancelled, and needs action: unpaid or not served |
| **Served** | Served and paid, not cancelled |
| **All** | Everything in the current bill, including cancelled |

A served but unpaid order stays in **Open** with both badges:

```text
[SERVED] [UNPAID]
```

Cancelled orders appear only in **All**, with a cancelled badge.

#### Orders page

Counter:

```text
[ Ongoing ] [ Done ]
```

Web:

```text
[ Ongoing ] [ History ]
```

Then:

```text
[ All ] [ In progress ] [ Ready ]
```

for the active queue, and:

```text
[ All ] [ Paid ] [ Unpaid ] [ Cancelled ]
```

for the completed/history list.

Rules:

- **Ongoing** means active work on both Counter and web.
- **Done** means the current business day on the Counter. Add `Done · Today` if
  the scope needs to be explicit.
- **History** means all-time orders on the web.
- Do not use **Completed** while Done and History are in use.
- `In progress` is a group filter, not a status pill. Pills say Confirmed or
  Preparing.
- **Done** as a button is reserved for dismissing a success pane.

### 2.8 Kitchen/Station vocabulary

Use:

```text
Ticket state: QUEUED → PREPARING → READY
Item state:   QUEUED → PREPARING → DONE
NEW:          unread ticket only
Filters:      All / Late / New
Urgency:      ON TIME / DUE SOON / LATE
Actions:      Start / Mark done / Mark ready / Recall / Reprint
```

Rules:

- Station UI says **Ticket**; technical/docs say **kitchen ticket**.
- Customer order remains **Order**.
- `NEW` is unread only.
- `QUEUED` means confirmed but not started.
- `PREPARING` is used on Station too; do not use `COOKING`.
- `READY` means the ticket is ready.
- `DONE` means an item is finished.
- Do not show raw `CONFIRMED`, `PREPARING` or `READY` in Station chips.
- Table cards use **TO SERVE** when food is ready.
- UI label for takeaway ID is **Pickup #**; code/API keeps `pickupNumber`.
- Takeaway order type remains **Takeaway**; `PICKUP` is a parser alias only.

### 2.9 Totals

Use:

```text
Subtotal
Tax
Service charge
Paid
Unpaid
```

Avoid `Already paid` and `Total unpaid` in new UI. If a clearer money label is
wanted later, use **Balance due** for the amount and keep **Unpaid** for the
status.

## 3. Current inconsistencies

| # | Area | Current | Problem | Recommended | Priority |
|---|---|---|---|---|---|
| T-01 | Counter order card | `StatusPill(order.status)` | Raw `PENDING`/`PREPARING` leaks into UI | Map through `orderStatusLabel` | P0 |
| T-02 | Payment status | `paymentLabel("PENDING")` returns `UNPAID` | Good, but no shared mapper for all screens | Centralize in `CounterFormat` | P0 |
| T-03 | Payment method | Counter `E-wallet`, web `E-Wallet`, receipt `ewallet` | Three spellings | **E-Wallet** everywhere | P0 |
| T-04 | Table card | `CONFIRM`, `READY`, `UNPAID` as status | Mixes table, bill and kitchen state | Separate table state + bill badge + kitchen summary | P0 |
| T-05 | Orders tab | Counter `Active`/`History`; web `Active`/`History` | Two vocabularies and wrong scope for `History` | Counter **Ongoing / Done**; web **Ongoing / History** | P1 |
| T-06 | Orders sub-filter | `In progress` | Sounds like a status | Keep as group; pills show Confirmed/Preparing | P1 |
| T-07 | Web status label | `Ready for Pickup` for every order | Wrong for dine-in | `Ready`; context in detail | P1 |
| T-08 | Receipt | `Payment: ${receipt.paymentMethod}` | Prints raw `ewallet` | Use `paymentMethodLabel` | P1 |
| T-09 | Payment action | `Pay` / `Record cash payment` / `Process Payment` | Three verbs | `Pay` -> `Record payment` -> `Payment recorded` | P1 |
| T-10 | Bill totals | `Total unpaid` / `Already paid` | Conversational and inconsistent | `Unpaid` / `Paid` | P2 |
| T-11 | E-Wallet button | `selectedLabel.lowercase()` | Produces `e-wallet` | Keep `E-Wallet` display | P2 |
| T-12 | Dialog dismiss | `Cancel`, `Not now`, `Close` | Inconsistent and ambiguous | **Cancel** for confirmations; **Close** for sheets; **Cancel order** for destructive | P2 |
| T-13 | Docs | Bill described as only unpaid | Will be wrong after session bill | Update after Phase 2 | P1 |
| T-14 | Table status PATCH | Can set `AVAILABLE` without closing session | Orphan session risk | Close session on status change | P0 |
| T-15 | Status pills | `StatusPill`, `BillStatusPill`, `TakeawayPill` are three private copies with three tone models | Same visual language implemented three times | Extract one `CounterStatusPill` + `CounterStatusTone` | P0 |
| T-16 | Takeaway bill | Shows raw `detail.status` and `Total due` / `Order total` | Friendly labels and money labels differ from table bill | Use shared status and payment label helpers | P1 |
| T-17 | Bill filters | Table proposed `Open/Served/All`; takeaway uses `To pay/All open/Ready` | Different jobs, not necessarily a defect | Keep different filters; share the control and vocabulary rules | P2 |

## 4. Implementation checklist

P0–P2 record the completed Phase 6 sweep. P3 and the final `Ongoing`/`Done`/`Cancel` alignment are still pending. See `Tabtep-App/docs/TERMINOLOGY-STANDARD-PLAN.md` for rollout phases.

### P0 — must be correct before the new bill ships

- [x] Add `CounterFormat.orderStatusLabel(status, orderType)`.
- [x] Add `CounterFormat.paymentStatusLabel(status)`.
- [x] Add `CounterFormat.paymentMethodLabel(method)`.
- [x] Add `CounterFormat.tableStateLabel(status)`.
- [x] Extract one shared `CounterStatusPill` + `CounterStatusTone`; use it in the table bill, takeaway bill and takeaway rows.
- [x] Replace raw status pills in the Counter with these helpers.
- [x] Fix receipt `Payment:` to use the method label.
- [x] Use `E-Wallet` in Counter, web, receipts and reports.
- [x] Separate table state, bill state and kitchen state on table cards.
- [x] Close the dining session when the table becomes `AVAILABLE`.

### P1 — same release if low risk

- [ ] Switch Counter and web active order lists to `Ongoing` (current code uses `Active`).
- [ ] Switch Counter completed list to `Done`; keep web `History` for all-time (current Counter uses `History`).
- [x] Replace `Ready for Pickup` with contextual `Ready`.
- [x] Change web `Process Payment` to `Record payment`.
- [ ] Update Counter empty-state copy to `Done` terminology (current code says `History`).
- [x] Update the takeaway bill to use shared status labels and the shared bill total labels.
- [x] Update `COUNTER-APP-DISCOVERY.md` bill semantics after the API change.

### P2 — later polish

- [x] Replace `Total unpaid` with `Unpaid`.
- [x] Replace `Already paid` with `Paid`.
- [x] Remove `.lowercase()` from the payment method action label.
- [ ] Use `Cancel` for confirmation dismiss; `Close` for information sheets (current Counter reports use `Not now`).
- [x] Audit notification copy for the same status words.
- [x] Audit reports/CSV/PDF labels.

### P3 — cross-surface Station/Kitchen

- [ ] Map Station ticket chips to `QUEUED` / `PREPARING` / `READY`.
- [ ] Map Station item states to `QUEUED` / `PREPARING` / `DONE`.
- [ ] Keep `NEW` for unread only.
- [ ] Use `Start` / `Mark done` / `Mark ready`.
- [ ] Use `ON TIME` / `DUE SOON` / `LATE`.
- [ ] Use `Ticket` in Station UI; `Kitchen ticket` in docs.
- [ ] Use `Pickup #` in UI; keep `pickupNumber` in code/API.
- [ ] Use `TO SERVE` on table cards.
- [ ] Add label tests for Station.

## 5. Code mapping

Add one shared label layer before changing screens.

### Counter

| File | Change |
|---|---|
| `core/model/.../CounterModels.kt` | Add label helpers; keep tone helpers |
| `counter/.../MainActivity.kt` | Use labels in all pills and cards |
| `counter/.../ReceiptPrinter.kt` | Map payment method; do not print raw |
| `counter/.../ui/ReportsPane.kt` | Delete private `paymentLabel`; use shared |
| `counter/.../ui/PaymentTenderSheet.kt` | Use `E-Wallet`; avoid lowercase |
| `counter/.../ui/PaymentResultPane.kt` | Keep `Payment recorded`; use Paid/Unpaid |

### Web

| File | Change |
|---|---|
| `src/lib/order-utils.ts` | Contextual Ready label; shared status labels |
| `src/lib/constants/payment.ts` | Already uses `E-Wallet`; reuse it |
| `src/components/pos/PaymentInterface.tsx` | `Process Payment` -> `Record payment` |
| `src/components/dashboard/OrdersOverview.tsx` | Use `Ongoing` / `History`; align filters |
| `src/components/tables/TableDetailModal.tsx` | Align table/bill wording with Counter |

### Station/Kitchen

| File | Change |
|---|---|
| `app/.../domain/StationLabels.kt` | Add ticket-state and item-action mappings |
| `app/.../ui/station/TicketCard.kt` | Map ticket chip; `Mark done` item action |
| `app/.../ui/StationScreen.kt` | Align filters/empty states |
| `app/.../ui/dialogs/ReadySheet.kt` | Keep `Ready`; align takeaway wording |
| `app/.../ui/dialogs/AllDaySheet.kt` | Keep `All day`; use `PREPARING` where a state is shown |
| `app/.../ui/dialogs/PrintQueueSheet.kt` | Keep print/retry wording |
| `StationLabelsTest.kt` | Add ticket/item/action label tests |

### Rules

- Do not rename Prisma enums for wording changes.
- Map backend values to UI labels at the presentation boundary.
- Never render a raw enum in a user-facing pill.
- Case may vary by component (uppercase pills, title case body), but the word
  must be the same.
- Add tests for each label helper.

## 6. Related decisions

- Technical model name for Option B: **`DiningSession`**, not `TableSession`.
- The legacy `src/lib/table-session.ts` file and its `TableSession` interface
  were renamed to `customer-session.ts` / `CustomerSessionRecord` in Phase 6.
- UI term for the current sitting: **Bill**.
- `DiningSession` is internal only; staff never see the word `session`.
- Counter completed list: **Done** (current business day).
- Web completed list: **History** (all-time).
- Counter/web active list: **Ongoing**.
- Station ticket: **QUEUED / PREPARING / READY**.
- Station item: **QUEUED / PREPARING / DONE**.
- Station unread badge: **NEW**.
- Table food-ready state: **TO SERVE**.
- Takeaway ID label: **Pickup #**; field `pickupNumber`.

## 7. Follow-up

This document only records the audit and the standard. The implementation plan
for the bill itself is in:

```text
Tabtep-App/docs/COUNTER-BILL-SESSION-PLAN.md
```

The Counter, web order/payment, receipt and report terminology sweep was
completed in Phase 6. This document is the active standard for those surfaces.

Kitchen/station terminology and the remaining web receipt/table labels are
covered by the cross-surface plan:

```text
Tabtep-App/docs/TERMINOLOGY-STANDARD-PLAN.md
```

Existing code that still differs should be treated as a bug unless this document
or the cross-surface plan explicitly says it is pending.
