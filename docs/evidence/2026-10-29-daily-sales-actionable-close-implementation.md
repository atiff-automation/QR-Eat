# Daily Sales and Actionable Close — Implementation Evidence

Date: 2026-10-29

## Scope delivered

- Business-day order list for Counter and website.
- Done orders view in Counter.
- Actionable close blockers from Reports and Close Day.
- Daily Sales page includes all orders, paid and unpaid.
- Payments and order history in order detail.
- Mandatory variance reason when counted cash differs from expected cash.
- Variance reason in Z PDF, thermal Z and closed-day list.

## Data rules

- Business day is the `BusinessDay` window (`openedAt` to `closedAt`/now), not
  the browser calendar day.
- `SERVED` is displayed as completed. It is not a new database status.
- Paid totals come from successful `Payment` rows.
- Open and served-unpaid orders are shown separately.
- Cancelled orders are excluded from gross and paid totals.
- Close remains blocked by:
  - open orders
  - served but unpaid orders
  - payments with uncertain status
- A close with a non-zero cash variance requires a non-empty reason. The
  reason is stored in `BusinessDay.closeNote`.

## API changes

- `GET /api/counter/reports/day/orders`
  - scopes: `all`, `history`, `completed`, `open`, `unpaid`, `cancelled`
  - payment-status filter, search, offset/limit
  - returns item, option, payment and cancellation detail
- `GET /api/counter/reports/day/blockers`
  - returns the orders behind `OPEN_ORDERS`, `UNPAID_ORDERS` and
    `PENDING_PAYMENTS`
- `GET /api/reports/daily/orders`
  - defaults to the current open business day
  - returns all orders, not only paid orders
  - returns paid, unpaid, open, cancelled and gross totals
- `GET /api/orders/[id]`
  - now includes payments and order events
- `POST /api/counter/business-day/close`
  - rejects a non-zero variance without a reason with
    `VARIANCE_REASON_REQUIRED`

## Counter changes

- Orders now has `Live` and `Done` tabs.
- Done includes served and cancelled orders with paid/unpaid/cancelled
  filters.
- Done orders open the existing detail sheet; item totals, payments,
  receipt numbers, reprint and status history are visible.
- Reports → Needs attention rows are clickable.
- Blocker sheet lists the affected orders and supports:
  - Open
  - Serve (ready orders)
  - Review bill (served unpaid)
- Close Day requires a variance reason and links back to blockers.
- Thermal Z prints the variance reason.

## Website changes

- `Reports → Daily Sales` replaces the paid-only Daily Orders behavior.
- Daily Sales shows:
  - all orders for the business date
  - completed, unpaid, open and cancelled filters
  - item names, quantities, options and payments
  - cancellation reason where available
  - CSV export
- Order detail modal shows payments, receipt, cash received and change.
- Z reports show the variance reason.
- `/dashboard/orders` accepts `status` and `time` query parameters for deep
  links.

## Verification

- QR-Eat Jest: 31 suites passed, 375 tests passed, 11 skipped.
- QR-Eat production build: passed.
- Counter shared tests: passed.
- Counter debug compile: passed.
- Counter release APK: built successfully.
- Local API runtime:
  - day-orders endpoint returned all-order totals
  - blocker endpoint returned the expected order list
  - daily report defaulted to the current business day
  - order detail returned payments and events
  - close without a variance reason returned `VARIANCE_REASON_REQUIRED`

Release APK SHA-256:

```text
b5a6d56759ea9c6eddeff374c4b8566efaaa4380e1efac5a7cd85758a25bb331
```

## Legacy cleanup completed

- Removed unused `DashboardLayout-legacy-backup.tsx`.
- Removed unused `route-legacy-backup.ts`.
- Removed duplicate `next.config.ts`; `next.config.js` is the single active
  config.
- Corrected the `BusinessDay.status` comment to include `CLOSING`.
- TypeScript baseline reduced from 570 to 556 errors; remaining errors are
  pre-existing and outside the touched reporting files.

## Deferred cleanup

- Decide the future of old report pages (`reports/sales`, comprehensive,
  customer, menu, operational) and the old Live Order Board.
- Split the large Counter report/view model code after the feature is verified
  in production.
- Add cash in/out and no-sale tracking before introducing variance thresholds.

## Detail card simplification

- Removed the order history timeline from the Counter detail card and the
  Counter detail API payload.
- Removed kitchen-ticket status from completed/cancelled detail views.
- Moved the paid/refund warning and customer-notified checkbox into the cancel
  order dialog.
- Moved Cancel order into the detail overflow menu.
- Kept items, quantities, line prices, total, payment method and paid/unpaid
  status as the primary information.
- Kept receipt reprint as a secondary action.
- Kept the richer website order detail for owner/accounting use.
- Detail title shows the full order number without the redundant `Order`
  prefix; font is reduced for longer identifiers.
- Pickup-chit reprint is hidden for served/cancelled takeaway orders.
- Cancel dialog is compressed: full order number subtitle, compact paid/refund
  warning surface, smaller reason chips, shorter notes field, and side-by-side
  Keep order / Cancel order actions.
- Verified on A73 at font scale 1.0 and 1.3.

## Production rollout

- Fresh pre-deploy backup:
  `/tmp/qr-eat-prod-before-daily-sales-deploy-20261029.dump`
- Production deployment:
  `a63c5929-3a54-40a2-9004-8bc20f653dae`
- A73 installed the new APK over the previous release.
- Verified:
  - Reports showed 12 open-order blockers.
  - Blocker sheet listed the actual orders and supported Serve/Open.
  - Serving an order reduced the blocker count and refreshed Reports.
  - Done loaded served orders across business dates.
  - Done detail showed items, total, payment, receipt number and reprint.
  - Order history was intentionally removed from the Counter detail card.
  - Website Daily Sales showed the current business date, open orders, items
    and filters.
- Two old test orders were served during verification; the remaining blocker
  count is 10. The business day was not closed.

## Deployment status

Production was deployed for this verification. No push, tag or version bump was
made.
