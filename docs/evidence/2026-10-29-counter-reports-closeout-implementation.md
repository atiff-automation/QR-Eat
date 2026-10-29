# Counter reports / close / Z implementation — 2026-10-29

**Status:** Implemented locally; not deployed.
**Scope:** QR-Eat server/website + Tabtep Counter Android app.
**Server/website commit:** `59d40c7`
**Counter commit:** `1a95b63`
**Counter APK SHA-256:** `71fea6f5cbdcac55142542f5a3daabd5afb5f0cc393b8c58122d8f78724010ab`
**Plan:** `docs/COUNTER-REPORTS-CLOSEOUT-PLAN.md`
**Counter UI plan:** `Tabtep-App/docs/COUNTER-REPORTS-UI-PLAN.md`

## Implemented

### Server

- Business-day schema and migration:
  - `BusinessDay`
  - restaurant close-time, opening-float and cash-drawer settings
- Timezone/cutoff helpers in `src/lib/time/business-day.ts`.
- Counter reporting service:
  - day summary
  - payment mix
  - 7-day totals
  - top items (day and 7-day)
  - cash expected/counted/variance
  - blockers
  - immutable Z snapshot
- Counter APIs:
  - `GET /api/counter/business-day`
  - `PUT /api/counter/business-day/opening-float`
  - `POST /api/counter/business-day/close`
  - `GET /api/counter/business-day/close/[id]`
  - `GET /api/counter/business-day/close/[id]/pdf`
  - `GET /api/counter/reports/day`
  - `GET /api/counter/reports/day/sales`
  - `GET /api/counter/reports/daily`
  - `GET /api/counter/reports/top-items`
- Manager/owner reporting access via `analytics:read`; cashiers denied.
- Validated business-day settings API.
- Website:
  - Business Day & Cash Drawer settings section.
  - Z Reports page at `/dashboard/reports/z`.
  - Z-report PDF link.
  - Orders history: 7-day filter and load-more pagination.

### Counter app

- Business-day/report/close models and API methods.
- Manager reports screen:
  - Today / Last 7 days
  - Summary / Sales
  - net sales, orders, average check
  - payment mix
  - top 3 sellers
  - unpaid/blockers
  - sales list with load more
- Opening float confirmation.
- Close Day:
  - counted cash
  - expected cash and variance
  - hard blockers, no carryover
  - server close + immutable Z
- 58mm/32-column thermal Z print (80mm optional formatter width).
- Final Z PDF share through Android share sheet.
- Reports entry under More → Manager → Reports, manager/owner only.

## Checks

- `npx prisma validate` passed.
- `npm test -- --runInBand` passed: 30 suites, 371 tests.
- `npm run build` passed.
- `./gradlew :core:model:test :core:network:test :counter:lintDebug :counter:assembleRelease` passed.
- New Counter API report test added.

## Production pilot

- Production DB backup taken before migration:
  `/tmp/qr-eat-prod-before-business-days-20261029.dump`
- Migration applied to Railway production.
- Railway deployment `aa5da0c7-944e-43c5-83c8-6e382c61b5c8` succeeded.
- `/api/health` returned 200 with database CONNECTED.
- Counter report APIs verified on `https://tabtep.app`.
- A73 release installed: `1.5.3` / `23`, SHA-256
  `71fea6f5cbdcac55142542f5a3daabd5afb5f0cc393b8c58122d8f78724010ab`.
- A73 verified:
  - manager Reports screen
  - production business-day report
  - close-day warning/flow
  - cash expected/counted/variance
  - Z snapshot
  - `Share PDF` Android share sheet
  - thermal print job sent to the paired KPrinter; operator confirmed the
    printed paper is good
- Production test day `2026-10-30` closed as `Z-261030-003`:
  - one cash sale
  - net MYR 22.99
  - cash expected/counted MYR 22.99
  - variance MYR 0.00
- Website `/dashboard/reports/z` data verified for the three production test closes.
- Website `/dashboard/reports/daily` data verified for the test sale.
- Additional production visual-audit sale closed as `Z-261031-004`:
  - net MYR 79.96
  - cash expected/counted MYR 79.96
  - variance MYR 0.00

## Visual audit fixes

- Added status/navigation bar padding to Reports and Z screens.
- Fixed the 7-day Summary to use 7-day KPIs instead of today-only KPIs.
- Removed today-only opening float/payment mix/unpaid cards from the 7-day
  Summary.
- Fixed the 7-day Sales tab to show daily totals instead of today’s
  transactions.
- Allowed KPI values to wrap at font scale 1.3 instead of truncating.
- Styled the close/opening-float dialogs with the app surface and 20dp shape.
- Added a proper printer icon and a Receipt printer entry in More.
- Changed the 7-day action label to `Close today`.
- A73 visual checks passed at font scale 1.0 and 1.3.

## Not done / next

- No manager step-up (accepted decision).
- No 24-hour business-day model.
- Thermal paper output was sent to the paired printer; physical paper quality
  should be checked by the operator.
- Legacy report/financial cleanup remains a follow-up.
- No push/tag/version bump.
