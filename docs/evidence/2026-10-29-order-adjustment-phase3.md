# Order Adjustment — Phase 3 Website

Date: 2026-10-29

## Scope

Website order actions and adjustment UI.

## Changes

- `OrderActionsMenu` now derives one valid action:
  - Cancel Order
  - Void Order
  - Refund Payment
  - no action
- Only managers/owners can adjust confirmed/served orders.
- Refund requires `payments:write`.
- Added `OrderAdjustmentModal` replacing the old cancel-only modal.
- The modal:
  - preflights `GET /api/orders/[id]` and uses the server adjustment policy
  - shows the correct title, warning and action label
  - requires customer notification for cancel/void
  - records a reason and optional notes
  - uses restaurant currency instead of hard-coded `$`
  - blocks the action when the server policy reports `NONE`
- Deleted the old `CancelOrderModal`.

## Endpoint behavior used

- Cancel: `DELETE /api/orders/[id]`
- Void: `POST /api/orders/[id]/void`
- Refund: `POST /api/orders/[id]/refund`

## Verification

- QR-Eat production build: passed
- Full Jest suite: 388 passed, 11 skipped
- Website deployment: `f1a58af1-f1eb-4513-b8b3-f58b5c98e4fe`
- Verified served-paid order `ORD-261028-AFBE-001`:
  - menu showed **Refund Payment**
  - refund dialog showed `RM 18.99`
  - action completed
  - order remained `SERVED`
  - payment status became `REFUNDED`
  - net payment is `0.00`
- Confirmed no further action is offered after the refund.

## Test-data note

`ORD-261028-AFBE-001` was refunded during end-to-end verification. The refund
is recorded as a negative cash payment. The business day remains open.

## Still deferred

- Partial refunds
- Granular `orders:void` / `payments:refund` permissions
- Legacy `refund-utils.ts` cleanup
- Old report status assumptions
- A dedicated post-close refund/accounting flow
