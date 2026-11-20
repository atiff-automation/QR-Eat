# Review 01 — QR-EAT-AME-023-ORDER-REFUSALS

**Reviewer:** fresh `ame-verifier`, independent of the implementer, read-only
**Date:** 2026-11-21
**Spec:** `TASK.md` revision 1 (D1–D6, S0–S5, AC1–AC9)
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff binding

| Item | Value |
|---|---|
| Base / working head | `6bca423803b8662288f20da2e159b43560563bec` |
| Tracked diff | `sha256:a3213a6c20bb8ddd53708d0b44e0455e09a2134de7355265f2f524954539584a` |
| Product-only diff (routes + harness) | `sha256:12f4d5a5a22026ac99dae1e7ee35339a70dbceecd1ebe55880aa560788e21563` |
| Untracked manifest (16 files) | `sha256:db0ef939ea0c3bbaa1f8470b74378442f0993e7358cd59d9edc931d165126f24` |
| Product-only set (routes, harness, helper, three tests) | `sha256:ac4f067e119d2af0e4b0dbfaf32eeb95b6ae20ebd3f8994b77ea311d8c9dbe53` |

The product-only hash is the stable binding for the code under review; the
combined manifest changes when the Lead edits task docs.

## Verified

- **Anonymous 401 on all six routes**, with a random non-existent id and no
  credentials: identical `401 {error, code}` before any lookup, no id echoed. A
  lookup-first implementation would have returned 404.
- **Cookie-only and Bearer-only** valid tokens both authenticate; `ready`/`recall`
  accept cookie clients. An invalid token gives `401` on the read/patch/status/
  modify routes and the documented `403` on `ready`/`recall` — never 500.
- **Audit rows:** five of six routes write an anonymous `AUTHENTICATION_REQUIRED`
  row; `status` writes none, as at base.
- **`modify`:** foreign and missing are byte-identical `404`, no order data, B
  unchanged, no `OrderModification`, no transaction. `403`, `400` and a genuine
  `500` with its log line are preserved. The mapping wraps only
  `requireOrderAccess` and rethrows non-RBAC errors.
- **AME-020 regression:** the harness diff is additive (137 insertions, 0
  deletions); the status recall ordering is unchanged; all prior assertions exact.
- **Helper purity:** `src/lib/api/refusals.ts` imports only `next/server`.
- **S3 audit spot-checks:** table rows accurate; restaurant rows accurate as
  helper-throw mappings, with the reachability caveat in L-02.
- **Mutation proofs:** reverting the 401 or the 404 mapping fails both the unit
  tests and the harness.
- Independent runs: 15 focused, 91 regression, full suite **1724 passed / 11
  skipped**, integration **20/20** on three consecutive runs.

## Findings

| ID | Severity | Issue | Disposition |
|---|---|---|---|
| L-01 | low | Anonymous `status` returns 401 but writes no anonymous audit row; pre-existing, no event lost. | Accepted deviation; recorded. If uniform audit coverage is wanted, it is a separate small change. |
| L-02 | low | In the audit, `requireRestaurantAccess` is mostly called with `context.restaurantId`, not a caller-supplied path id. The "27 distinguishable refusals" summary overstates route-level exposure; the genuinely reachable foreign-id sites (`restaurants/[id]`) are in the identical-500 class. | **Lead fixes the BACKLOG note**: revive `AME-024` with the path-id vs context-id distinction, and the corrected counts (11 table / 35 restaurant). |
| L-03 | low | `AME-024` said 10/~30 vs the measured 11/35; `ACTIVE.md` said the branch was not created. | **Fixed by the Lead** before the commit gate. |
| N-01 | note | Anonymous `GET`/`PATCH` still log `console.error` before mapping to 401 (monitoring noise, pre-existing). | Accepted. |
| N-02 | note | `isAuthenticationFailure` is a message-string check, consistent with existing routes; no over-broad path found. | Accepted. |
| N-03 | note | Invalid token on `ready`/`recall` stays 403 (documented). | Accepted. |

No critical, high or medium defect.

## Acceptance criteria

| AC | Result |
|---|---|
| 1 anonymous 401 on six routes, audit as before | Met with L-01 |
| 2 `modify` identical 404, no data, no mutation | Met |
| 3 happy paths / 403 / 400 / business rules unchanged | Met |
| 4 shared helper only, no Prisma/RBAC/domain import | Met |
| 5 audit table + `AME-024`, routes untouched | Met with L-02 |
| 6 harness exact 401 + modify equality, prior assertions exact | Met, mutation-proven |
| 7 full gates | Local met; **CI not run** |
| 8 no RBAC/auth/contract/schema/dependency change | Met |
| 9 no deploy/seed/prod/Tabtep edit | Met |

## Not verified

- CI (`verify` + `integration`) — branch not pushed.
- Middleware; real Android/Counter clients; production/staging.
- All 35 restaurant call sites at runtime (three spot-checked).
- Non-order anonymous 500s — deliberately out of scope.

## Residual risk

- `status` has no anonymous audit row, so audit-based detection there is weaker.
- Invalid-token `ready`/`recall` staying 403 is coupled to kitchen-actor
  resolution.
- `AME-024` is larger and more nuanced than its backlog line implied.
- Handler tests bypass middleware.

## Routing

**PASS WITH NOTES.** No code correction required. L-02/L-03 are Lead bookkeeping
fixes; L-01 is accepted and recorded. Ready for the R2 commit gate; both CI jobs
must be green on the pushed branch before merge.
