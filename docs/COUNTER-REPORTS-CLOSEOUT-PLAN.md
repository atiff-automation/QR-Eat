# Counter reports, business-day close and Z report — readiness and phased plan

**Status:** Proposed · 2026-10-29
**Scope:** QR-Eat website/server + Tabtep Counter Android app
**No implementation yet.** This document is the source of truth for the
reporting and closeout work.

## 1. Product decision

- The Counter app gets a **manager-only operational report**: today summary,
  today's sales list, 7-day daily totals, top 3 sellers and a close-day entry
  point.
- The website remains the **management and accounting surface**: full history,
  custom ranges, itemised daily orders, final Z report, cash reconciliation,
  exports, analytics, retention.
- The server is the **system of record**. The phone never stores 12 months of
  orders.
- **Block the final close, not the draft summary.** A manager can always view a
  draft; the final close is gated.

### 1.1 Locked decisions

| # | Decision |
|---|---|
| 1 | Business-day cutoff is configurable per restaurant; default 04:00 local time. |
| 2 | There is no late payment after close. Close requires every payment resolved. |
| 3 | No order carryover. Final close is hard-blocked until every order/issue is resolved. |
| 4 | No new business day until the current day is closed. Once Close Day starts, new orders/payments for that day stop. |
| 5 | Opening float is configured on the website and confirmed in the app at the start of the business day. |
| 6 | No manager step-up for now. Manager/owner server RBAC only. |
| 7 | Thermal printer default 58mm/32 columns; 80mm/48 columns optional. |
| 8 | Card/QR are recorded only, not settled. Cash is the only true reconciliation. |
| 9 | Manager can share the final Z as a server-generated PDF. |
| 10 | Financial records stay on the server; back up and export now, full retention automation later. |
| 11 | Add an ADR and supersede docs that say Counter reports/printing are out of scope. |
| 12 | Cutoff is a business-date warning, not auto-close. Close Day is a deliberate manager action. |

## 2. Readiness verdict

| Area | Status | Summary |
|---|---|---|
| Counter app | **Not ready** | No reports, close, cash or Z APIs/screens. Printer exists but is not Z-grade. |
| Website reports | **Partial** | Several live reports exist, but no final snapshot, itemised daily report, cash recon or Z. |
| Website settings | **Partial** | Tax/service/receipt/payment settings exist; no business day, cash drawer, report or printer settings. |
| Shared foundation | **Not ready** | No BusinessDay, cash session, immutable snapshot, report permission or business-date library. |
| Permissions | **Not ready** | Manager lacks export; report APIs do not consistently enforce analytics permissions. |
| Time/day handling | **Not ready** | UTC sequence, server-local report boundaries and browser-local order filters disagree. |
| Data retention | **Incomplete** | Orders/payments effectively indefinite; events 7 days; no documented 7-year policy or backup/export. |

## 3. What is safe to reuse

### Counter app

- Compose Material 3 theme, typography and palette.
- `CounterSectionHeader`, `CounterSegmentedControl`, `CounterSearchField`,
  `CounterIconButton`, status pills.
- Existing full-screen task-flow pattern (`BuilderTopBar`, `BackHandler`).
- Bluetooth SPP ESC/POS transport.
- Receipt/pickup print plumbing and printer setup dialog.
- Existing order detail, bill and payment flows.
- Manager/owner role detection and `payments:write`/`orders:fulfill` gating.

### Website/server

- Order, order item, payment and receipt data.
- Existing report pages as reference, not as the final close model.
- Financial settings (currency, tax, service charge, labels).
- Receipt settings (header/footer, 80mm).
- Payment methods (cash/card/e-wallet).
- Existing RBAC permission constants and tenant context.
- Existing order history API pagination primitives (`limit`/`offset`).

## 4. What must not be reused as-is

| Do not reuse | Reason |
|---|---|
| `/api/reports/sales` as the Z report | Filters by `SERVED`/order date, not payments; no snapshot. |
| `/api/staff/analytics/*` as the mobile report API | Cookie auth, large payloads, no mobile summary, no consistent permissions. |
| Current report cache/HTML/CSV as final output | Process-local, mutable, unescaped, not immutable. |
| Current 50-row order list as full history | No pagination; not all orders. |
| Generic `PUT /settings/restaurant` | Mass assignment; bypasses section validation. |
| Local Counter PIN as manager authorization | Device unlock is not server authorization. |
| Direct Bluetooth printing from the ViewModel | No queue/idempotency; not Z-grade. |
| Fixed 32-column receipt layout for 80mm Z | 32 columns is 58mm class; 80mm usually needs 48 columns. |

## 5. Counter app UI plan

### Entry point

**More → Manager → Reports.** Do not add a fourth bottom tab.

Reports are manager-only and occasional. Cashiers keep Pending/POS/Orders
unchanged.

### Screen structure

```
Reports
[Today] [Last 7 days]        [Refresh]
Summary | Sales

Summary:
  Net sales / Orders / Avg check
  Payment mix
  Top 3 sellers
  Unpaid / exceptions
  [Close day]

Sales:
  Today: paginated transaction list
  7 days: daily total cards → tap a day → transactions
```

### UI rules

- Full-screen task flow, not a modal sheet inside the POS shell.
- Use the existing `BuilderTopBar` task-flow pattern for the top bar.
- Use `CounterSectionHeader` for sections once it is moved out of
  `MainActivity` into `counter/ui`.
- Use the existing 4dp `SectionGap`; extract it to one shared constant.
- 48dp minimum touch targets; primary actions at least 56dp.
- No colour-only status.
- No new visual language.
- No dense tables on phone; use cards and two-line rows.
- Font scale 1.3 must not clip.
- Show `as of` server time and business date.
- Loading, empty, error, offline and stale states are explicit.

### Reports entry data

- Today summary: net sales, order count, average check, payment mix, unpaid.
- 7-day view: daily totals, no single 7-day raw list.
- Top 3: quantity sold, not revenue.
- Sales list: time, receipt/order, table/pickup, type, payment, total, status.
- Actions: view order, reprint receipt, close day.
- No adjustment screen in V1; use existing same-day order actions.

### Close day flow

1. Manager starts Close Day; new orders and payments for the current day stop.
2. Review server totals by payment method.
3. Resolve every blocker: pending/active/ready, unpaid table, unpaid takeaway,
   payment uncertainty, failed print, open cash drawer.
4. Enter counted cash; show expected cash and variance.
5. Confirm close (manager/owner server role).
6. Server returns immutable Z snapshot.
7. Print thermal Z; failure does not undo close.
8. New business day opens only after a successful close.
9. Reprint from close history with `REPRINT` marker.

No carryover is allowed. If a blocker cannot be resolved, the day remains open
and the new day does not start.

The business-day cutoff is a warning, not an automatic close. Close Day is a
deliberate manager action after service. Before Close Day starts, new orders
continue in the current day; once it starts, new orders/payments for that day
stop.

### Thermal Z report

- Default 58mm/32 columns; 80mm/48 columns optional.
- Include: restaurant header, Z number, business date, close time, manager,
  gross/net, discounts/comps/voids/refunds, tax/service, payment mix, cash
  expected/counted/variance, order counts, close ID, and `OPEN ORDERS: 0`.
- Print server snapshot only; never compute Z on the device.
- Draft/X report may print before close; final Z only after close.
- Persist print failure; do not silently retry a final Z.

## 6. Website UI plan

### Settings

Add a **Business Day & Reports** settings section:

- Timezone (editable, IANA-validated)
- Business-day cutoff
- No-carryover policy (fixed, not configurable)
- Z-report prefix
- Report header/footer
- Opening cash float default
- Cash drawer enabled
- Report permissions/export policy

Add a **Cash Drawer** section if cash is accepted.

Use the existing web UI standard:

- `DashboardLayout` owns the page title.
- `mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6`
- White toolbar: `rounded-xl border border-gray-100 bg-white p-4 shadow-sm`
- Shared `Button`, `LoadingSpinner`, `ConfirmationModal`
- No duplicate `h1`
- Status badges use text + colour

### Orders

- Extend `/dashboard/orders` with server-side pagination, date range, search,
  status/payment/channel filters.
- Add an itemised daily order report with CSV/PDF.
- Do not rely on the 50-row cap.

### Reports

- Keep the existing report pages as management reports.
- Add **Draft summary** and **Final Z**.
- Final Z is immutable and reprintable.
- Add itemised daily order report.
- Add cash expected/counted/variance.
- Add report generation/export audit.
- Link the Counter app to these reports via authenticated deep links.

### Report permissions

- `reports:read` for viewing.
- `reports:export` for PDF/CSV.
- `reports:close` or `cash:reconcile` for close.
- Owner: all.
- Manager: read, export/close as approved.
- Waiter/kitchen/cashier: none.
- Enforce on server, not only navigation.

## 7. Shared data model

Add to QR-Eat Prisma:

- `BusinessDay`
  - `restaurantId`, `businessDate`, `status(OPEN|CLOSED)`, `openedAt`,
    `closedAt`, `closedBy`, `closeNote`, unique `(restaurantId, businessDate)`
- `CashDrawerSession`
  - `businessDayId`, `openingFloat`, `countedCash`, `expectedCash`, `variance`,
    `countedBy`, `countedAt`, breakdown JSON
- `CashMovement`
  - `type(PAID_IN|PAID_OUT|FLOAT|REFUND|DROP)`, `amount`, `reason`, `createdBy`
- `ReportSnapshot` / `ZReport`
  - `businessDayId`, `reportNumber`, `payload JSON`, totals, cash fields,
    `generatedBy`, `generatedAt`, `locked`
- `ReportPrintJob`
  - `reportId`, device/station, status, payload, printedAt, error

Add `Restaurant` settings:

- `businessDayCloseTime`
- `reportFooterText`
- `zReportPrefix`
- `cashDrawerEnabled`
- `defaultOpeningFloat`
- `retentionDays`

Add order history safety:

- Add `menuItemName`/price snapshot to `OrderItem` or change
  `OrderItem.menuItem` from `Cascade` to `Restrict`/`SetNull` so menu deletion
  cannot erase historical order lines.
- Add appropriate indexes for report queries.

## 8. API plan

### Counter

```
GET  /api/counter/reports/day?businessDate=YYYY-MM-DD
GET  /api/counter/reports/day/sales?businessDate=...&cursor=...&limit=...
GET  /api/counter/reports/daily?days=7
GET  /api/counter/reports/top-items?businessDate=...&limit=3
GET  /api/counter/business-day
POST /api/counter/business-day/close
GET  /api/counter/business-day/close/{id}
```

### Website/server

```
GET  /api/reports/daily?date=YYYY-MM-DD
GET  /api/reports/daily/[date]/orders
GET  /api/reports/range?from=&to=
POST /api/reports/z
GET  /api/reports/z/[id]
GET  /api/reports/z/[id]/export?format=csv|pdf|json
POST /api/reports/z/[id]/print-jobs
GET  /api/cash-drawer/current
POST /api/cash-drawer/close
```

All report responses include `serverTime`, `businessDate`, `timezone`,
`currency`, `asOf`, and a version.

### Definitions

- **Gross sales:** sales before discounts/comps/voids/refunds.
- **Net sales:** gross less discounts, comps, voids and refunds.
- **Payments:** payment ledger totals by tender, used for cash/card/QR.
- **Expected cash:** opening float + cash payments − cash refunds − cash paid
  out.
- **Variance:** counted cash − expected cash.
- **Order count:** distinct orders; do not double-count split payments.
- **Z report:** final snapshot built from payment ledger + closed business day,
  not a live order-status query.

## 9. Phased plan

### Phase 0 — Decisions, ADR and baseline

**Goal:** remove ambiguity and stop drift.

- Approve the ADR that Counter may expose manager reports/close, while full
  reports stay web.
- Lock the decisions in section 1.1.
- Confirm the operational consequence: no new day until close; no new orders
  after Close Day starts; all payments resolved.
- Confirm cash drawer: opening float at start of day, counted at close,
  default float configurable on web.
- Confirm manager export/close permissions and no step-up.
- Confirm printer default 58mm/32 columns, optional 80mm/48 columns.
- Baseline: record current report/order discrepancies and known broken pages.
- Update existing decisions/docs that currently say reports are out of scope.

**Exit:** ADR signed; no code.

### Phase 1 — Server foundation

**Goal:** one source of truth for business date, reports, cash and close.

- Add Prisma models and migration: BusinessDay, CashDrawerSession,
  CashMovement, ReportSnapshot/ZReport, ReportPrintJob.
- Add validated settings fields (timezone, cutoff, cash, report, retention).
- Build `src/lib/time/business-day.ts`.
- Update sequence manager and all day filters to restaurant timezone/cutoff.
- Build reporting service layer:
  - daily summary
  - daily sales
  - range summary
  - top items
  - cash reconciliation
  - Z snapshot
- Add report permissions and server enforcement.
- Add report/export audit.
- Backfill business dates for existing orders where safe; mark unknowns.
- Fix existing broken report filters:
  - `Payment.status = COMPLETED`/`partially_refunded`
  - refund handling
  - SERVED-only revenue mismatch
- Add tests: timezone boundary, cutoff, refunds, cash variance, idempotent
  close, permission denial.

**Exit:** report/close APIs return correct, permissioned, timezone-aware JSON;
no UI yet.

### Phase 2 — Website management

**Goal:** managers/owners can see full history and final close on web.

- Add Business Day & Reports settings; use validated section APIs, not generic
  PUT.
- Add Cash Drawer settings.
- Extend order history with pagination, date range, search, filters.
- Add itemised daily order report and export.
- Add draft summary and final Z pages.
- Add cash reconciliation UI.
- Add final snapshot reprint/export.
- Fix broken financial report and analytics hooks, or hide them until rebuilt.
- Apply web UI standard and permission guards.
- Link Counter report screen to web full reports.

**Exit:** website can answer “show me every order for the day”, “print the final
Z”, “export the day”, and “show full history” without the 50-row cap.

### Phase 3 — Counter reports

**Goal:** manager can view today/7-day sales and top 3 on the device.

- Add report API client/models.
- Add `CounterReportsViewModel` and `ReportsUiState` (do not grow
  `CounterUiState` by 15+ fields).
- Move shared UI primitives out of `MainActivity`:
  - `CounterSectionHeader`
  - `CounterIconButton`
  - `SectionGap`
- Add `ReportsPane` full-screen flow via More → Manager → Reports.
- Summary: net sales, orders, average check, payment mix, top 3, unpaid.
- Sales: today paginated list; 7-day daily totals; tap day.
- Add business date/as-of/refresh; loading/empty/error/offline states.
- Add web deep link.
- Tests: formatting, parsing, pagination, permission gate, 1.3 font scale.

**Exit:** manager-only reports work on phone/tablet; cashier cannot see or call
them; numbers match web for same business day.

### Phase 4 — Counter close + thermal Z

**Goal:** manager can reconcile cash, close the day, and print the Z.

- Add close-day entry and readiness screen.
- Stop new orders/payments once Close Day starts.
- Add cash count, expected cash, variance, notes.
- Add hard blockers; no carryover. Server close with idempotency key.
- Add close result screen.
- Add pure ESC/POS Z formatter and tests (32/48 columns).
- Add printer profile (default 58mm/32; optional 80mm/48).
- Add durable print failure/reprint; do not block close on print failure.
- Persist close attempt key in encrypted store; clear on logout.
- No manager step-up; enforce manager/owner server RBAC.

**Exit:** A73 closes a test business day, prints Z, reprints, handles printer
failure, blocks cashier, and matches web snapshot.

### Phase 5 — Cleanup, retention and hardening

**Goal:** remove legacy risk and make the feature supportable.

- Consolidate duplicate report APIs into the reporting service.
- Remove dead analytics/legacy routes and backup files.
- Decide one Next config; remove the other.
- Remove unused receipt/date/timezone helpers or wire them.
- Split giant report route and Counter MainActivity/ViewModel where practical.
- Fix `OrderItem` cascade/history risk.
- Define retention: financial 7 years, customer PII minimisation, events
  90–180 days, audit 1–2 years.
- Add backup/restore and export policy.
- Schedule cleanup jobs and audit them.
- Add CI: `:counter:testDebugUnitTest`, lint, release build, report tests.
- Add device matrix: phone/tablet, font 1.3, printer off, app restart.

**Exit:** no P0 audit findings; legacy backlog scheduled; retention and backup
documented.

## 10. Legacy cleanup backlog

### Before/with the feature

- Generic settings PUT mass assignment.
- Report APIs missing permission checks.
- Broken financial report and analytics hooks.
- `Payment.status` invalid filters and refunds.
- 50-row order history cap.
- UTC daily sequence.
- Printer width fixed at 32 columns.
- Counter docs that say reports/receipt printing are out of scope.
- Duplicate `SectionGap` and private shared UI in `MainActivity`.
- Counter direct Bluetooth print from ViewModel (no queue).

### After the feature

- `MainActivity.kt` (~3,990 lines) and `CounterViewModel.kt` (~2,580 lines).
- `OrderBuilderPane.kt` (~1,198 lines), `CounterApiClient.kt` (~1,284 lines).
- Duplicate ESC/POS code between `app/.../Printer.kt` and
  `counter/.../ReceiptPrinter.kt`.
- Unused `CounterPaymentAttempt` model.
- `spike/` module.
- QR-Eat backup files, duplicate `next.config.*`, legacy auth, unused analytics
  routes, scratch scripts.
- Placeholder report metrics, unsafe CSV/HTML generation, dead report links.
- Menu-item cascade risk for historical order lines.

## 11. Risks and open decisions

Locked:

1. Business-day cutoff is configurable; default 04:00 local.
2. No late payment after close.
3. No carryover; hard close gate.
4. No new day until close; no new orders after Close Day starts.
5. Cash drawer: opening float at start, count at close.
6. No manager step-up.
7. Printer default 58mm/32, optional 80mm/48.
8. Card/QR recorded only; cash is the only true reconciliation.
9. Manager shares final Z as PDF.
10. Keep financial data on server; backup/export now, retention automation later.

Still to decide/verify:

1. Exact opening-float default per restaurant (e.g. MYR 200).
2. Whether cash is removed during the day; if yes, add a simple cash-drop entry later.
3. Multi-device close race and server lock strategy.
4. Malaysia hosting/data-residency review with accountant.
5. Existing docs/decisions conflict (D8/D44, API contract) — ADR needed.
6. Whether the restaurant ever operates 24 hours; the no-new-day-until-close model does not fit 24-hour service.

## 12. Acceptance criteria

- Website and Counter agree on business date and net sales.
- Manager can view today and 7-day sales; cashier cannot.
- Top 3 sellers match web for the same range and metric.
- Order history is paginated and complete; itemised daily report exports.
- Final Z is immutable, reprintable, and based on payments.
- Cash expected/counted/variance is auditable.
- Thermal Z aligns at 58mm/32 columns by default, supports 80mm/48 columns,
  prints after close, survives print failure, and reprints with marker.
- Close is blocked until every order/payment is resolved; no carryover.
- No new business day starts until close succeeds.
- No silent adjustments to closed days.
- Permissions, audit and retention are enforced server-side.
- No 12-month raw order data stored on the phone.
