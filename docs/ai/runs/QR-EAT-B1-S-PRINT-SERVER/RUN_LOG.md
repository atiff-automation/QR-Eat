# Run Log — QR-EAT-B1-S-PRINT-SERVER (B1-S)

**Task:** `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md` revision 1
**Risk:** R3 · **Workflow:** FEATURE / ARCHITECTURE
**Status:** **MERGED & DEPLOYED** — verifier **PASS WITH NOTES**; all findings
closed; R3 commit `fd014d4`; merge `6d59a56`; Railway deployment
`cb4f7519-2f2a-4b9a-b09c-c4af6553d36f` **SUCCESS**; health **UP**; loyalty/HMAC
unset
**Date:** 2026-11-17
**Branch:** `feat/b1-s-print-server` (base `main` `58b64d9`; code base `612cde7`)
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`, frozen `39031bb`
**Contract task:** `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md`
**Implementer:** one `ame-implementer` (`ses_e178dc606ffehGkUPDq7QaeoyQ`)
**Verifier:** fresh `ame-verifier` (`ses_e176b1783ffe2GyJUUQbLV59Wv`)

## Approval

- Owner O-1–O-9 approved as recommended, 2026-11-17.
- O-1 approves the frozen contract; O-2 keeps C-8 cashier scope; O-3 puts
  cancellation printing in B3; O-4 keeps C-7 `NONE` auto-`SKIPPED`; O-5 keeps
  C-10 device-ack audit plus AME-012; O-6 keeps the new-onboarding `COUNTER`
  default plus the B2 setup prompt; O-7 requires B1-S + B1-W before B2; O-8
  fixes the B3 feed; O-9 approved the freeze push.
- B1-S is the explicit owner approval for the sensitive station/device, order
  status, audit and RBAC-permission paths named in the task.

## Scope delivered

- `Station.settings.printMode` (`STATION | COUNTER | NONE`), normalized on read,
  new stations default `COUNTER`, existing rows untouched.
- Printable event payloads stamped with the effective mode; initial status
  `PENDING` / `SKIPPED` per §5.1.
- Shared pure print-ack authority/transition service.
- Device ack authority, audit, optional `reprint`, no-downgrade, legacy
  `seq`-less compatibility.
- Counter `GET .../print-tickets` and `POST .../print-ack`.
- No-Kitchen confirmation guard for all-`COUNTER`/`NONE`; mixed and unrouted
  behaviour preserved.
- Cashier PREPARING/READY/SERVED under C-8, `orders:counter_serve` plus
  role-template fallback, audit.
- Tests, type-check, build.

No schema/migration, seed run, dependency, loyalty/HMAC, web UI, B2/B3, deploy,
push or Tabtep edit.

## Baseline

- `main` clean at `58b64d9`; `df40e1d` ancestor confirmed.
- `git diff 612cde7..HEAD -- src prisma scripts` empty before work (only docs
  after `612cde7`).
- Baseline suite before B1-S: 118 suites passed, 1 skipped; 1444 tests passed,
  11 skipped; type-check and build green.

## Implementation evidence

**Tracked product diff hash:** `84ce705de553556e1373e37edfc9d04bae9fc26adabb8325ce8e7a9b4a426e4b`
**Tracked product + new product contents hash:** `0578ac6a9f3c621e09170938db33b9da7523cd4b61e50b1dfcbc1bb37672e683`
**Full tracked diff hash (includes docs):** `62fb8da15841a4cfab493ba6e3c0bf212aa1d8664bfe4d60cd2bc52e995c2ec2`
**Tracked product diff:** 11 files, +621 / −119, plus **13 new product files**.
**Full tracked diff:** 16 files, +841 / −162 (includes run/release docs).

### Files changed

Tracked:

```text
prisma/seed.ts                                      (permission + cashier mapping only; not run)
src/app/api/orders/[id]/status/route.ts
src/app/api/stations/[id]/route.ts
src/app/api/stations/me/print-ack/route.ts
src/app/api/stations/route.ts
src/lib/order-events.ts
src/lib/rbac/permission-constants.ts
src/lib/services/order-dispatch-service.ts
src/lib/station-settings.ts
src/tests/order-dispatch-service.test.ts
src/tests/station-settings-route.test.ts
```

New:

```text
src/lib/print/print-ack-service.ts
src/lib/print/__tests__/print-ack-service.test.ts
src/app/api/counter/orders/[orderId]/print-tickets/route.ts
src/app/api/counter/orders/[orderId]/print-ack/route.ts
src/tests/cashier-order-status.test.ts
src/tests/counter-print-ack-route.test.ts
src/tests/counter-print-tickets-route.test.ts
src/tests/order-dispatch-print-mode.test.ts
src/tests/order-events-print-mode.test.ts
src/tests/order-print-authority.test.ts
src/tests/station-print-ack-route.test.ts
src/tests/station-print-mode-routes.test.ts
src/tests/station-print-mode.test.ts
```

## Verification

| Check | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | **PASS** (exit 0) |
| Targeted | `npx jest` — print service, station/Counter routes, event/authority/cashier tests | **PASS** — 11 suites, 114 tests |
| Full tests | `npm test -- --runInBand` | **PASS** — 128 suites passed, 1 skipped; **1553 passed, 11 skipped** |
| Build | `npm run build` | **PASS** (exit 0) |
| Whitespace | `git diff --check` | clean |
| Format | `npx prettier --check` on changed files | clean |
| Lint | `npx eslint` on changed source files | exit 0 (no new findings; whole-repo lint baseline remains red) |

Lead re-ran type-check, full tests and build after correction cycle 1 with the
same results.

## Contract trace

| Contract clause | Implementation |
|---|---|
| §4.1–4.2 mode/values/defaults | `src/lib/station-settings.ts`; `POST/PATCH /api/stations`; device settings/snapshot normalizer |
| §4.3 stamping | `resolveRouting().printModes`; payload `printMode` in created/items.added/cancelled |
| §4.4 authority | `isAckAuthorized` + routes; 409 `PRINT_AUTHORITY_INVALID`; C-13 audit-only device skip |
| §5.1 initial status | `initialPrintState()`; `NONE`/`COUNTER` cancellation `SKIPPED` |
| §5.2 transitions | `planPrintAck()`; `PRINTED` terminal; first `printedAt` |
| §5.3 writers | created/items.added/cancelled + both ack routes; non-ticket null |
| §6 Counter payload | `print-tickets/route.ts`; UUID 400; 404 mapping; printable filter; `UNKNOWN` |
| §7 Counter ack | `print-ack/route.ts`; validation; `eventId` idempotency; CAS; audit; reprint/downgraded/replayed |
| §8.6 reprint | `printAuditDescription()`; `printedAt` preserved |
| §9.1 cashier C-8 | `resolveOrderPrintAuthority()`; status route; `orders:counter_serve` + fallback |
| §9.2 no-Kitchen guard | `resolveRoutedStationModes()`; mixed/unrouted/override/offline preserved |
| §9.3 independence | no print-state gate on status/payment |
| §10.1 device ack | authority + audit + optional reprint; legacy `seq` path |
| §10.3 snapshot | `printMode` through normalizer; no other shape change |
| §12 security | tenant 404s; event/order/station/restaurant binding; `trustedIp`; no PII/printer secrets |
| §15.2 requirements | all implemented; tests pin them |

## Verifier report

**REVIEW-01: PASS WITH NOTES.** No Blocker/High. Medium findings were:

- **R-01** S6 close-out not done → this run log/release record/NEXT now close it.
- **R-02** C-8 resolver only mocked → direct `resolveOrderPrintAuthority()` tests
  added; cashier route now exercises the real predicate.
- **R-03** Counter ack auth gate untested → 401/403/password/role/permission
  tests added with no-write assertions.

Low findings closed in correction cycle 1:

- **R-04** contract `INVALID_ACK` (§7.2) vs `VALIDATION_FAILED` (§7.5) →
  implemented the specific §7.2 `INVALID_ACK` for `success:true` +
  `skipped:true`; all other body errors stay `VALIDATION_FAILED`. Contract text
  unchanged; this is the recorded interpretation.
- **R-05** invalid `orderId` shape → UUID validation returns 400
  `VALIDATION_FAILED` on both Counter routes.
- **R-06** payload filters unpinned → tests now pin printable types, tenant
  filter and non-printable exclusion.
- **R-07** routing duplication → shared `resolveItemRoute()` used by both the
  event writers and the dispatch resolver.

Recorded notes (no code change): R-08 `downgraded` is always false and
`NO_DOWNGRADE` is in the audit; R-09 audit-only device skip changes no event
column; R-10 unrouted `printAuthority:null`; R-11 `NONE` cancellation carries
the KDS skip error; R-12 device CAS 500; R-13 platform-admin audit type; R-14
pre-existing untracked Tabtep docs.

## Deviations from the frozen contract

1. **R-04 internal conflict:** §7.2 `INVALID_ACK` vs §7.5
   `VALIDATION_FAILED` for `success:true` + `skipped:true`. Implemented the
   specific §7.2 code; recorded here because the contract must not be edited in
   B1-S. No other clause deviates.
2. No other known deviation. The implementation follows C-1…C-13 and the
   approved O-1…O-9.

## Residual risk

- Device-ack audit grows `audit_logs`; no scheduled cleanup until AME-012.
- `printMode` is JSON and can be written invalid by a direct DB writer; reads
  normalize to `STATION`.
- CAS retries are mocked, not exercised against a real PostgreSQL race; bounded
  at 3 with a safe-to-retry 500 on exhaustion.
- No live DB, HTTP bearer/session, LAN printer, Counter/Kitchen hardware or
  Tabtep client verification.
- Legacy Kitchen builds that send `success:true` on `COUNTER`/`NONE` now get
  409 by design; the Kitchen compatibility run is still required before B2.
- `order.items.added` still has no producer; add-on tickets remain unreachable
  until B3/follow-up.

## Merge, deployment and health — 2026-11-17

- Implementation commit: **`fd014d4`** (`feat(print): implement Phase B print
  server B1-S`), branch `feat/b1-s-print-server`.
- Merge: **`6d59a56`** (`merge: Phase B print server B1-S`, `--no-ff`) on
  `main`; pushed `58b64d9..6d59a56`.
- Railway auto-deployment:
  **`cb4f7519-2f2a-4b9a-b09c-c4af6553d36f`**, commit `6d59a56`,
  **SUCCESS**.
- `GET https://tabtep.app/api/health` → **200**:
  `status=UP`, `database=CONNECTED`, `env=production`,
  `edgeIp.source=x-real-ip`.
- `railway status` → service **Online**, deployment id above.
- Environment check: `LOYALTY_ENABLED` **UNSET**,
  `LOYALTY_PHONE_HMAC_KEY` **UNSET**. No loyalty enablement, no HMAC change.
- No manual deploy, restart, redeploy, seed or migration was run. The start
  command ran `prisma migrate deploy` as part of the normal deploy; no new
  migration exists in this task.
- B1-W and B2 were not started.

## Guardrails

- No seed run, migration, schema change, new dependency, loyalty enablement,
  HMAC change, manual deploy, push or Tabtep edit.
- Implementer did not commit. The Lead owns the R3 commit gate and merge.
- B1-W and B2 were not started.

## Next

Fresh delta review of R-01–R-07, then the R3 commit gate with the exact path
list and diff hash. After merge, confirm the automatic Railway deployment and
that loyalty/HMAC remain unset.
