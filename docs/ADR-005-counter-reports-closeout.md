# ADR-005 — Counter manager reports, business-day close and Z report

**Status:** Accepted · 2026-10-29
**Supersedes:** the “reports are out of scope” statements in Counter decisions
D8/D44, `COUNTER-APP-PLAN.md`, `UI-UX-PLAN.md` and `API-CONTRACT.md` where they
conflict with this ADR.

## Context

Managers need a fast end-of-day view and a printable Z report at the Counter.
The website already owns reports and history, but the Counter had no sales
summary, close state, cash reconciliation or Z output.

## Decision

- Counter may expose **manager/owner-only operational reports**:
  today summary, today’s sales, 7-day daily totals and top 3 sellers.
- Counter may **close the business day** and print/share the final Z.
- Full history, custom ranges, itemised reports, P&L, accounting exports and
  deep analytics remain on the website.
- The server is the system of record. The phone never stores 12 months of
  orders.
- There is **no order carryover**. Close is hard-blocked until every order and
  payment is resolved.
- No new business day is created until the current day closes.
- Business-day cutoff is configurable; default `04:00` restaurant-local.
- Cash is the only true reconciliation. Card/QR are recorded totals only.
- Thermal Z defaults to 58mm/32 columns; 80mm/48 columns is optional.
- Manager can share the final Z PDF.
- No manager step-up in this phase; manager/owner server RBAC applies.

## Consequences

- Counter gains a manager Reports/Close flow and thermal Z.
- Website needs business-day settings, Z history/PDF and full history.
- Existing live reports remain management reports, not final Z snapshots.
- Migration and staging/A73 validation are required before production.
- Cash drops and 24-hour operation require a separate future decision.
