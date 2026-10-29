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
