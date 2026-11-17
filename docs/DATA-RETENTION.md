# Data retention and backup policy

**Status:** Active baseline · 2026-10-29

## Financial records

Keep orders, payments, refunds, receipts, Z snapshots and daily business-day
records for **at least 7 years**. This is the practical baseline for Malaysian
income-tax and accounting records. Confirm the final policy with the
restaurant's accountant.

## Operational records

- Counter/order events: 90–180 days.
- Audit logs: 1–2 years.
- Report exports: store outside the app if the accountant needs them.
- Counter device cache: current business day/shift only.

## Customer personal data

Customer names, phone numbers and email addresses are personal data. Keep them
only as long as needed for the order/accounting purpose. Anonymise or remove
them from old orders when they are no longer required, while retaining the
financial order/payment totals.

## Closing a restaurant vs deleting one

- **Close (the normal path).** `PATCH /api/restaurants/{id}` with
  `{ "isActive": false }`. The restaurant stops taking orders; every order,
  payment, business day, member and loyalty row is retained. This is how a
  restaurant leaves the product.
- **Delete (only an empty tenant).** `DELETE /api/restaurants/{id}` succeeds only
  when the restaurant has no order, payment batch, business day, member, loyalty
  visit or order discount. Otherwise it returns
  `409 RESTAURANT_HAS_HISTORY`: the loyalty foreign keys are `onDelete: Restrict`
  and the records must be kept for seven years.

## Genuine erasure (after the retention period)

Deleting a restaurant that holds history is not a delete request; it is an
erasure request, and it runs only after the seven-year retention window:

1. **Export.** Produce the accounting export for the retention period (Z
   snapshots, payments, refunds, receipts, orders) and hand it to the owner or
   their accountant. Keep the export outside the application.
2. **Anonymise.** Null the personal data on the retained financial rows: order
   and session names, phones and emails, member names, E.164 numbers, consent
   text hashes. Keep `phoneHash`, the totals and the payment rows.
3. **Delete.** Only then remove the tenant's rows. The delete is a manual,
   approved operation — there is no scheduled job and no endpoint for it in v1.

`DELETE /api/restaurants/{id}` never performs steps 1–3: it refuses a restaurant
with history.

## Backup

- Nightly database backup.
- Tested restore at least quarterly.
- Export Z PDFs/CSV for accounting.
- Do not rely on the Counter device as a backup.
- Confirm the database/backup hosting location meets Malaysian record-keeping
  requirements.

## Code rule

Do not add an order/payment deletion path without an explicit retention decision
and an archive/export path. Financial snapshots must remain immutable.
