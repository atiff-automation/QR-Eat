# Review 01 — QR-EAT-B1-S-PRINT-SERVER

**Task:** `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md` revision 1
**Verifier:** fresh `ame-verifier`, session `ses_e176b1783ffe2GyJUUQbLV59Wv`
**Implementer:** `ses_e178dc606ffehGkUPDq7QaeoyQ`
**Date:** 2026-11-17
**Risk:** R3
**Base:** `main` `58b64d9`; code base `612cde7`
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`, frozen `39031bb`

## Verdict

**PASS WITH NOTES.** No Blocker or High finding. The B1-S server surface
implements S1–S5 and acceptance criteria 1–13. The Medium findings were closed
by correction cycle 1; the Low findings were fixed or recorded. N-01 (unused
test import) and N-02 (stale evidence hashes/counts) were closed before the
gate. The R3 commit gate is ready.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| R-01 | Medium | S6 run log/release/NEXT had not been updated. | **Closed** — `RUN_LOG.md`, `NEXT.md`, `TASK.md`, `RELEASE-COMPATIBILITY.md` now record implementation, tests, hashes, trace and deviations. |
| R-02 | Medium | C-8 resolver was only mocked. | **Closed** — `src/tests/order-print-authority.test.ts` tests the real resolver: stamped COUNTER vs live STATION, stamped STATION, no events, unrouted, legacy fallback. Cashier route uses the real predicate. |
| R-03 | Medium | Counter ack auth gates were untested. | **Closed** — 401, role/password 403 and missing `orders:write` 403 tests with no-write assertions. |
| R-04 | Low | Contract internal conflict: §7.2 `INVALID_ACK` vs §7.5 `VALIDATION_FAILED` for `success:true` + `skipped:true`. | **Closed with recorded interpretation** — implemented the specific §7.2 `INVALID_ACK`; contract text unchanged; recorded in `RUN_LOG.md`. |
| R-05 | Low | Invalid `orderId` shape returned 404. | **Closed** — UUID validation returns 400 `VALIDATION_FAILED` on both Counter routes, before access check/transaction. |
| R-06 | Low | Payload test did not pin printable/tenant filters. | **Closed** — asserts the exact three printable types, `restaurantId`, and non-printable exclusion. |
| R-07 | Low | Routing loop duplicated between event writer and dispatch resolver. | **Closed** — shared `resolveItemRoute()` used by both; mapped/default/none tests added. |
| R-08 | Note | Counter `downgraded` is always false; `NO_DOWNGRADE` is in audit. | Recorded; matches the literal §5.2/§7.3 wording. |
| R-09 | Note | Non-authority device SKIPPED changes no event column. | Recorded as the C-13 “audit-only” interpretation. |
| R-10 | Note | Unrouted confirmation audit `printAuthority:null`. | Recorded; unrouted guard still ran. |
| R-11 | Note | `NONE` cancellation carries the KDS skip error. | Recorded; harmless/consistent. |
| R-12 | Note | Device ack CAS exhaustion returns 500. | Recorded; bounded retries, safe retry. |
| R-13 | Note | `changedByType` can be `platform_admin`. | Recorded; allowed by the audit schema. |
| R-14 | Note | Pre-existing untracked Tabtep docs. | Not attributable to B1-S; no tracked Tabtep change. |
| N-01 | Low | Unused `PostgresEventManager` import in `cashier-order-status.test.ts`; eslint failed. | **Closed** — import removed; eslint exits 0. |
| N-02 | Low | Stale evidence: 12 vs 13 new files; 9/101 vs 11/114 targeted tests. | **Closed** — run/release/NEXT updated; hashes recomputed. |

## Verified

- **S1:** `printMode` enum/defaults/normalization; create `COUNTER`; explicit
  create value; PATCH validation; no backfill; device settings/snapshot.
- **S2:** payload stamping for created/items.added/cancelled; `NONE` and
  `COUNTER` cancellation initial `SKIPPED`; non-ticket null; idempotent
  `recordOrderCreated`; no add-items producer invented.
- **S3:** authority matrix; C-13 audit-only device skip; `PRINTED` terminal;
  first `printedAt`; last authoritative `printDeviceId`; device audit; optional
  `reprint`; legacy `seq`-less path.
- **S4:** Counter payload shape, tenant 404, UUID 400, printable filter,
  `UNKNOWN`, `printedBy`, `canAck`, ordering, empty 200; ack validation,
  `INVALID_ACK`, `eventId` idempotency, authority 409, station mismatch,
  no-downgrade, reprint/downgraded/replayed, same-transaction audit, no PII.
- **S5:** no-Kitchen guard for all-`COUNTER`/`NONE`, mixed `STATION` requirement,
  unrouted any-device guard, override/offline, audit fields; cashier C-8 scope,
  CONFIRMED/CANCELLED denial, takeaway/recall guards; `orders:counter_serve` +
  cashier seed + fallback.
- **Scope:** no schema/migration/dependency/loyalty/HMAC/seed run/deploy/B1-W/B2.
- **Security:** tenant scoping, event/order/station/restaurant binding,
  cross-tenant 404, `trustedIp`, no printer secrets/PII in audit/logs.

## Evidence

```text
git status --short                 → 16 tracked modified, 13 new product files
git diff --stat                    → 16 tracked, +841/−162
git diff --check                   → clean
git merge-base --is-ancestor df40e1d HEAD → true
git diff df40e1d..HEAD -- src prisma scripts → 0
npm run type-check                 → PASS
targeted jest                      → 11 suites, 114 tests PASS
npm test -- --runInBand            → 128 suites passed, 1 skipped; 1553 passed, 11 skipped
npm run build                      → PASS
npx prettier --check changed files → clean
npx eslint changed source/tests    → clean
```

Hashes:

- tracked product diff: `84ce705de553556e1373e37edfc9d04bae9fc26adabb8325ce8e7a9b4a426e4b`
- product + new contents: `0578ac6a9f3c621e09170938db33b9da7523cd4b61e50b1dfcbc1bb37672e683`
- full tracked diff (includes docs): `62fb8da15841a4cfab493ba6e3c0bf212aa1d8664bfe4d60cd2bc52e995c2ec2`

## Not verified

- No live PostgreSQL race/transaction test; CAS is mocked.
- No live HTTP bearer/session auth test; route tests mock tenant/permission.
- No LAN printer, Counter/Kitchen hardware or Tabtep client build.
- No whole-repo lint (known red baseline); changed files are lint-clean.
- No deployment in this task; merge/deploy is the next gate.

## Residual risk

- Device-ack audit volume; AME-012 owns retention/cleanup.
- `printMode` is JSON and can be written invalid by a direct DB writer; reads
  normalize to `STATION`.
- Bounded CAS retries can return a safe-to-retry 500 under extreme contention.
- Legacy Kitchen builds that send `success:true` on `COUNTER`/`NONE` now get
  409 by design; a Kitchen compatibility run is required before B2.
- `order.items.added` still has no producer; add-on tickets remain unreachable
  until B3/follow-up.
- The R-04 `INVALID_ACK`/`VALIDATION_FAILED` contract conflict is recorded, not
  amended in the frozen contract.

## Gate

**Ready for the R3 commit gate.** Exact path list and hashes are in
`RUN_LOG.md`. The owner instruction of 2026-11-17 authorizes the implementation,
commit, merge and automatic Railway deployment, with no manual deploy, seed,
loyalty enablement or HMAC change.
