# Review 25 — QR-EAT-LOYALTY-PROMO-V1 · P9-10b (audit IP centralisation)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P9-10b
**Verifiers:** `ses_e262103eeffek7ep0cT17I9wjG` (PASS WITH NOTES) · `ses_e26137826ffedoWOWr2MeumAZU` (PASS, delta)
**Implementers:** `ses_e26280cbdffeOc7p13Njykng2g` · `ses_e2614fbd1ffeJ0UNiRs1zckjaw`
**Date:** 2026-11-14 · **Risk:** R2 · **Base:** `afe15fc`
**Tracked diff hash:** `bc36c0abd2883d3d5b75b8b033c3352a72e95aaffe3eb6e4ca74e878806fb676` (final, after the lint delta below)
**Combined hash (16 paths):** `c763fbdb2343d1f790dd7711b1ab42472824ad27a7eb3b599e0a11f1e5709ba2`

## Verdict

**PASS.** P9-10b closes. One correction cycle (F-01/F-02, both test hygiene).

## What changed

Every persisted `ipAddress` now comes from the resolver:

- `SecurityUtils.getClientIP` delegates to `trustedIp` — this covers ~20 auth and admin routes
  at once, which is where most audit rows are written;
- `tenant-context.ts` (2 sites) and `rbac/route-helpers.ts` (3 sites);
- seven routes: `orders/[id]/status` (2), `pos/payment/[orderId]`, both menu-availability
  routes, `counter/orders/[orderId]/send`, `counter/orders`, `tables/[id]/regenerate-qr`.

`grep -rni "x-forwarded-for|x-real-ip" src` now matches only `client-ip.ts` and tests.

Also folded in from REVIEW-24: `'platform'` source for `request.ip`, `edgeIp` on every health
payload, port/zone tests at all positions, a health shape test, a cause-neutral warning message,
and a runbook check that reads `/api/health` on the **public** URL.

## Verified

- **No raw header is persisted.** Broader scans (`cf-connecting-ip`, `true-client-ip`,
  `forwarded`, `request.ip`, `remoteAddress`) find nothing outside the resolver.
- **No IP is used for a decision.** Every persisted value is audit/logging only; no comparison
  exists. The one IP-keyed decision (the in-memory RBAC limiter) receives the same client value
  as before.
- **Formatting churn is formatting only.** `route-helpers.ts` shows 279 changed lines but 51
  with `git diff -w`; `security.ts` 103 vs 61. The only semantic hunks are the import and the
  `trustedIp(request)` replacements.
- **No payload leaks an address.** `edgeIp` is `{ source, xffEntries }` on all four return
  paths; the test asserts the absence of both header literals.
- **Red-capable:** the two error-payload tests fail on the base route; the `platform` source
  test fails on the base resolver; the warning test fails on the old message.
- **No regression:** 1383 passed / 11 skipped; no schema, migration or dependency; audit event
  type, severity and metadata unchanged.

## Correction cycle

| ID | Finding | Status |
|---|---|---|
| F-01 | The health route's 5 s DB timeout was never cleared, so every full run ended with `Jest did not exit` — noise that would hide a real handle leak | Fixed — handle captured, `try/finally`, cleared on every path; warning gone |
| F-02 | The health test spied on `process.uptime` without restoring | Fixed — `jest.restoreAllMocks()` in `afterEach` |

## Notes carried

| ID | Note | Route |
|---|---|---|
| F-03 | Acceptance 2 (persisted value is the resolver output) is guarded only by a manual grep, not a test | Backlog |
| F-04 | The runbook quotes the warning prefix, not the full string — accurate as a substring | Cosmetic |
| R-04 | Some special-use ranges (`192.0.0/24`, `198.18/15`, `192.88.99/24`) are accepted; not exploitable behind an edge that overwrites the header | Backlog |
| P9-10b-1 | Off-Railway (local/dev) audit `ipAddress` now resolves to `unknown`; intended fail-closed posture, no such deployment exists | Recorded |
| P9-10b-2 | The 5 s timeout-firing branch has no automated test; `clearTimeout` there is a provable no-op | Backlog |

## Post-review lint delta

The pre-commit hook blocked on a **pre-existing** `@typescript-eslint/no-explicit-any` in
`src/lib/rbac/route-helpers.ts:164` — a file P9-10b already touches, so lint-staged lints it.
The cast was unnecessary: `user.currentRole.userType` and the `allowedTypes` element type are the
same three-member union. Removed `as any`; type assertion is erased at compile time, so behaviour
is identical. Verified by `ses_e260e301dffeTxTVu1VH53opzI` (PASS): eslint clean, type-check
clean, 1383 passed / 11 skipped, no open handles. `route-helpers.ts` is now
`59437a5b9f18d7d0f88c12abe6bfafa5496f292ed35ef003f8932f19717ca243`.

## Not verified

- Live Railway requests or production audit rows (no DB access).
- Custom-domain edge behaviour.
- Pre-delta byte comparison of the two hygiene files (inferred from the file set and content).

## Residual risk

- The diagnostic is only meaningful from the public URL; the internal healthcheck may read
  `unknown` by design.
- A future raw-header read would pass CI; only the grep catches it (F-03).
- Same-model verification; P11 still owes a different-model pass.
