# Counter reports / close / Z implementation — 2026-10-29

**Status:** Implemented locally; not deployed.
**Scope:** QR-Eat server/website + Tabtep Counter Android app.
**Server/website commit:** `59d40c7`
**Counter commit:** `1a95b63`
**Counter APK SHA-256:** `b54fec1f9d6ba186993ad1270e15fee7a907b67c42a4ac794b7692c7c46fd69d`
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

## Not done / next

- Migration must be applied to the target database before deployment.
- No server/website deployment or production data changes.
- No device installation of the new Counter build yet.
- No A73 end-to-end close/Z test yet; requires migrated server endpoint.
- No manager step-up (accepted decision).
- No 24-hour business-day model.
- Website itemised daily order export/CSV not added yet.
- Legacy report/financial/analytics cleanup remains a follow-up.
