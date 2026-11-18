# REVIEW-01 — QR-EAT-B3-S-COUNTER-FEED revision 1

**Reviewer:** `ame-verifier` (fresh, read-only) — `ses_e1251ca3effegPPbNW6vIlHS45`
**Date:** 2026-11-18
**Task:** `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md` revision 1 (approved
2026-11-18)
**Risk:** R3
**Base:** `a0e3753303e2260b5dac1ef3408b966a059fcf3b` (`a0e3753`)
**Branch:** `feat/b3-s-counter-feed`, HEAD == base (no commits)
**Implementer:** `ses_e1279dc1dffe73zs748xaNxsYC`

## Verdict

**PASS WITH NOTES.**

No critical, high or medium findings. The specification is implemented end to
end: add-items producer, transactional add-on/cancellation tickets, canonical
cancellation, durable change/audit rows, staff SSE signals, changes coverage,
`counterAutoPrint`, migrations and the contract draft. The contract should not
be frozen verbatim until the text corrections below are applied.

## Diff binding

| Hash | Value | Reproduced |
|---|---|---|
| Full tracked | `e75227cc8d82b675982500e632851fa08d6966f074c228699b61a00d1ed8c10e` | yes |
| Product tracked | `8601eac728151e9616c9c49bd345b3837705b0d8f24759b585692b47a116043d` | yes |
| Product + new | `319fcf0ced94eafeeb3838ef67ddf7a6b6351c6167e5ad72358c3af72eff233f` | no |

The verifier bound the review with the two reproducible hashes and a per-file
SHA-256 inventory of every untracked product file. The Lead must record the
exact product+new recipe in the run log (R-09).

## Findings

| ID | Severity | Location | Issue | Required action |
|---|---|---|---|---|
| R-01 | low | `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` §3.3 vs `order-add-items-service.ts` | Contract says all guards are re-checked under the transaction; the business-day guard runs only before the transaction. | Soften the contract sentence or re-check closed-day in-tx. |
| R-02 | low | `order-adjustment-http.ts` + `COUNTER-FEED-CONTRACT.md` §5.2/§12 | Contract promises `404 ORDER_NOT_FOUND` for a missing order; code returns 404 with code `NOT_FOUND` for a genuinely missing id. Cross-tenant is already `ORDER_NOT_FOUND`. | Map RBACError 404 to `ORDER_NOT_FOUND` on adjustment routes, or change the contract table. |
| R-03 | low | `src/lib/order-events.ts` around `recordOrderItemsAdded()` | Stale B1-S comment says the writer has no caller and "do not invent a caller". B3 now calls it. | Update the comment. |
| R-04 | low | `order-adjustment-service.ts` | The post-commit `RBACLog` security event was removed and replaced by the durable `audit_logs` row. Durability is better, but security-event counts/analytics lose cancel/void/refund rows. | Restore the best-effort `RBACLog` write after commit, or record the change as accepted in the release record. |
| R-05 | low | `docs/PRODUCT/API-CONTRACT.md` | Only the `/api/orders` route count changed. No `§20 phase-b-counter-feed-v1` pointer, route row or SSE/changes facts. | Add the pointer/route/event facts before freeze. |
| R-06 | low | `order-add-items-service.ts` and `order-adjustment-service.ts` | Both re-read then update `orders` unconditionally. An add-items/cancel interleave can write an add-on or totals onto a just-cancelled order; different-key concurrent cancels of a PAID order could double-refund. Same-key retries are safe. Pre-existing modify route has the same pattern. | Make the final order write version-conditional (`where:{id, version}`) or take the shared bill lock in cancellation. |
| R-07 | low | `print-ack-service.ts` `counterAutoPrint` | A legacy cancellation chit with `printStatus=null` (projected `UNKNOWN`) is auto-printable once under `COUNTER` because the rule is `!== 'PRINTED'`. Code matches the contract wording, but the wording admits this. | Document the legacy-`UNKNOWN` case explicitly, or restrict to `PENDING/FAILED/SKIPPED`. |
| R-08 | low | `docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md` | State drift: branch "planned; not created", backlog "planning / awaiting approval" while implementation is in review. | Lead updates the state docs. |
| R-09 | info | n/a | Product+new hash could not be reproduced by the verifier. | Lead records the exact hashing recipe; per-file hashes remain the binding inventory. |
| R-10 | info | add-items service tests | The P2002 unique-key race branch is implemented but untested. | Optional test; not required for PASS. |

## Contract/code mismatches to fix before freeze

1. R-01 in-tx guard claim.
2. R-02 `ORDER_NOT_FOUND` vs `NOT_FOUND`.
3. §5.4 does not say whether the chit `version` is pre- or post-cancel. Code
   emits the post-increment version; state it for B3-C.
4. R-07 legacy `UNKNOWN` cancellation chit wording.

## Passed checks (summary)

- Add-items route/auth/tenant 404; server-side pricing; snapshots; loyalty path;
  version/modification increments.
- Only added items in the add-on ticket; `orderVersion`; `COUNTER/STATION=PENDING`,
  `NONE=SKIPPED`; PENDING writes no event.
- Idempotency scope/hash, replay, different-body 409, cross-tenant resistance,
  derived `OrderModification` keys.
- Canonical `DELETE`; `PATCH /status` `CANCELLED` 409; reason/version/totals;
  one chit per station with a printable event; no chit for PENDING/no-ticket or
  VOID/REFUND; `COUNTER` chit stays `SKIPPED`.
- Event/change/audit in transaction; SSE after commit; `order.created` unchanged.
- One staff SSE; additive types/payload; tenant filter; no cursor change.
- Changes route shape/410 unchanged; `counterAutoPrint` matrix; ack matrix.
- Additive migrations; schema diff only the new model; idempotent seed SQL.
- No `.env`, secret, dependency, seed or `phase-b-print-v1` edit.

## Not verified

- Manual two-tenant staging gate (AC16) — **not run**; no real-Postgres
  tenant-isolation claim.
- Tabtep-App client grep (repo absent from this worktree); web repo re-checked.
- Real concurrency/lock behaviour; P2002 race.
- Production migration/deploy/seed.
- Lint baseline re-measurement at `a0e3753`.

## Disposition

Correction cycle 1: R-01, R-02, R-03, R-04, R-05, R-06, R-07 and optional R-10
to the same implementer. R-08 and R-09 are Lead-owned state/evidence updates.
Re-verify the corrected diff before freezing `phase-b-counter-feed-v1`.

## Evidence

- `npm run type-check`: PASS.
- Targeted tests: 6 suites/44 tests PASS; second batch 6 suites/86 tests PASS.
- Full tests: 136 passed + 1 skipped; 1640 passed, 11 skipped, 1651 total.
- `npm run build`: PASS with generated non-secret build env; FAIL without the
  pre-existing required env (not a regression).
- `npm run lint`: 61 errors, 11 warnings (baseline 62/11; not worse).
- Disposable Postgres 16: 37 migrations applied; second deploy no-op; permission
  SQL idempotent (1 permission / 1 cashier mapping); `migrate diff` no difference.
- No file edited by the verifier; tree unchanged.
