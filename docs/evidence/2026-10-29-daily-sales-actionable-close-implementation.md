# Daily Sales and Actionable Close — Implementation Evidence

Date: 2026-10-29

## Scope delivered

- Business-day order list for Counter and website.
- Completed orders view in Counter.
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

- Orders now has `Live` and `Completed` tabs.
- Completed includes served and cancelled orders with paid/unpaid/cancelled
  filters.
- Completed orders open the existing detail sheet; item totals, payments,
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
d78a4f7dd526c3ae692262b9fc9fa35f3270a85581ca3088f4ecbcddadcd9012
```

## Deferred cleanup

- Remove or consolidate `DashboardLayout-legacy-backup.tsx`.
- Remove or consolidate `route-legacy-backup.ts`.
- Consolidate `next.config.js` and `next.config.ts`.
- Decide the future of old report pages (`reports/sales`, comprehensive,
  customer, menu, operational) and the old Live Order Board.
- Split the large Counter report/view model code after the feature is verified
  in production.
- Add cash in/out and no-sale tracking before introducing variance thresholds.

## Deployment status

No production deployment, push or tag was made as part of this implementation.
