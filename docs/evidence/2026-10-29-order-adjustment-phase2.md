# Order Adjustment — Phase 2 Counter

Date: 2026-10-29

## Scope

Counter UI only. Website adjustment actions remain Phase 3.

## Changes

- Renamed the Counter `Live` filter to `Ongoing`.
- Order detail now receives a server-computed `adjustment` policy:
  - `CANCEL`
  - `VOID`
  - `REFUND`
  - `NONE`
- The detail More menu shows only the allowed action:
  - Ready/pre-service: **Cancel order**
  - Served unpaid: **Void order**
  - Served paid: **Refund payment**
- Added a shared compact adjustment sheet:
  - Cancel pre-service order
  - Void served-unpaid order
  - Refund served-paid order
- Refund mode shows the amount and keeps the order served.
- Void mode makes clear that no payment is refunded.
- Closed-day orders expose no adjustment action.
- After an adjustment, Counter refreshes Pending, Ongoing/Done, tables,
  takeaway and Reports.

## API detail change

`GET /api/orders/[id]` now returns:

```json
{
  "adjustment": {
    "action": "CANCEL | VOID | REFUND | NONE",
    "allowed": true,
    "reason": null
  }
}
```

The UI does not duplicate the policy.

## Verification

- Counter debug compile: passed
- Counter release APK: built
- Core model/network/session tests: passed
- QR-Eat production build: passed
- Policy/service/business-day tests: 13 passed
- A73:
  - `Ongoing` filter visible
  - READY order detail showed **Cancel order**
  - Served paid order API policy returned **REFUND**
  - No served-paid cancel action is exposed

Release APK SHA-256:

```text
f4df54609fc1e30266e9582c1e6602554a23ec47abe283e8e7c9f2e93c0dc70c
```

## Deployment

- QR-Eat deployment: `864c3091-33ee-4f76-a654-3fb24cbd6598`
- A73 APK installed
- Website still uses the old cancel-only UI; Phase 3 is required before website
  served-order cancellation is aligned.

## Test-data note

One old test order, `ORD-261028-AFBE-003`, was cancelled and refunded during
adjustment testing. The refund is recorded; the business day remains open.

## Deferred cleanup

- Website `CancelOrderModal` and `OrderActionsMenu`
- `refund-utils.ts` and duplicate cancel helpers
- Partial refunds
- Granular void/refund permissions
