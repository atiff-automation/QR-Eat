# Review 23 — QR-EAT-LOYALTY-PROMO-V1 · P9 (rehearsal and rollout)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P9
**Verifiers:** `ses_e26a47575ffegrbng3QS33zgSy` (PASS WITH NOTES) · `ses_e268960fdffe2lIiFSjNU5ps9t` (PASS WITH NOTES) · `ses_e267bbcf1ffew1hd4vQeHx9sgz` (PASS WITH NOTES)
**Implementers:** `ses_e26bb1d60ffe7ze0ppgRcvRhCG` (P9) · `ses_e269928ccffex0Kuz6q1KFEVw1` (corrections) · `ses_e267ec957ffemF6ykM2K3JB4j1` (runbook)
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `4bde73e`
**Tracked diff hash:** `7b5f40c00946a05157560693e48326c877cb49c19edd9c6746f19aea93ecb61a`
**Runbook hash:** `df523ceea30b520c86be65bdb36b808069e299911ccc7e76b392341f96c8bfca`

## Verdict

**PASS WITH NOTES.** P9 closes. One correction cycle plus a documentation delta.

## What P9 actually proved

| Drill | Claim | Result |
|---|---|---|
| 9a fresh | 35 migrations from empty, seed, `migrate status` up to date, `migrate diff` empty | **45/45** on the upgrade set; 9a itself clean |
| 9b upgrade | pre-loyalty rows survive the loyalty replay; new NOT NULL columns take defaults; CHECKs validate | **45/45** — red-capable: a NOT NULL column without a default aborts the replay |
| 9c concurrency | two payments on one bill; member change vs payment; rename vs anonymise; rate-limit increments | **47/47** — real separate connections, atomic `ON CONFLICT … RETURNING` |
| 9d rollback | flag off ⇒ legacy path, zero loyalty rows, data intact | **included in 9c** — now with `LoyaltySettings.enabled = true` |
| 9e permissions | ten loyalty permissions, owner/manager split per §18.20.14 A | **31/31** against the seeded DB |
| 9f edge | one process-wide warning when no trusted address | unit test, exact text, no address |
| 9g runbook | executable by a non-author | `PILOT-RUNBOOK.md` |

## The one finding that mattered

**P9-01.** The rollback drill created its restaurant with `withLoyalty: false`, so it had **no `LoyaltySettings` row**. The state an operator is actually in when rolling back is the opposite: global `LOYALTY_ENABLED` unset **while the restaurant is still enabled**. The drill therefore could not distinguish "honours the env flag" from "only checks the per-restaurant row" — a regression that ignored `LOYALTY_ENABLED` entirely would have passed the pilot gate.

Fixed: the rollback fixture now has `enabled = true`, a member is attached to a second bill, and the drill asserts `LoyaltySettings.enabled` is still true while the quote returns `200 LOYALTY_DISABLED`, zero loyalty rows are written, and both bills pay through the legacy path. A regression keying only off the settings row now fails.

**This is the pattern the pilot gate exists to catch**: a drill that exercises the code path but not the operator's state.

## Also corrected

| ID | Finding | Status |
|---|---|---|
| P9-02 | 9b did not carry a row across the loyalty replay for `idempotency_records` | Fixed — **and the finding's premise was wrong**: the table is created by `20261113120000_loyalty_promo_v1`, not pre-existing. The row is inserted after that migration and must survive the remaining four; survival + `convalidated` FK asserted |
| P9-04 | drill 3 was spawn-biased to rename-then-anonymise, the safe order | Fixed — deterministic anonymise-then-rename added |
| P9-05 | runbook omitted `db:seed`; the ten permissions exist only in `prisma/seed.ts` | Fixed — prerequisite, exact query, expected mapping |
| P9-06 | the 9f warning check sat in a step where the warning cannot fire | Fixed — moved after enabling, says it fires on request |
| P9-07 | "Settings → Rewards" was ambiguous between two identically labelled entries | Fixed |
| P9-11 | test proved once-per-module, not once-per-process; no exact-text assertion | Fixed — text asserted, wording softened |
| P9-12 | cleanup label overstated what it checked | Fixed |
| R-02 | the runbook's SQL fallback wrote `noticeText` without `noticeTextHash`, which makes `resolveNotice` return null and **disables loyalty** | Fixed — the fallback no longer touches the notice columns; the dashboard owns text/version/hash |
| N-01 | a guest request can consume the once-per-process warning before the operator's test quote, so a tail-only check can look clean | Fixed by the Lead (documentation) — the runbook now says absence of a new line is not proof |

## Verified

- **The upgrade drill is red-capable.** It inserts rows *before* the replay, so `ALTER TABLE … ADD COLUMN … NOT NULL` without a `DEFAULT` aborts; wrong defaults are caught by value assertions (`lookupLimitPerHour === 30`, `discountVersion === 0`, `billRevision === 0`).
- **Concurrency uses genuinely separate connections** — each racer is a child process with its own pool; the parent only creates fixtures and asserts final state.
- **Rate-limit atomicity is real**: `count === 50` after concurrent increments, and a refusal leaves all four buckets at the limit — only possible if the transactional rollback works.
- **9e reads the seeded DB**, not a hard-coded list.
- **The warning is PII-safe and wired at all three consumption paths**; the message is a constant.
- **No regression:** 1341 passed / 11 skipped, type-check and build green, scoped ESLint clean.
- **Constraints:** no `prisma/migrations/**` change, no dependency, no production config, no secret, no PII in evidence.

## Notes carried

| ID | Note | Route |
|---|---|---|
| P9-03 | Drills 1–3 synchronise with fixed sleeps, not a readiness barrier; on a slow machine the "race" can degenerate to sequential and still pass | **P11** |
| P9-08 | `scripts/**` is outside `tsconfig.json` `include`, so `npm run type-check` does not cover the rehearsal scripts | Accepted, disclosed |
| P9-09 | Flag-off payments now write `PaymentBatch.outcome = 'GUEST'`, a value the pre-feature code never wrote — additive, and the runbook relies on it, but it is a behaviour change under the "flag off reproduces pre-feature behaviour" criterion | **P10** record |
| P9-10 | **The Railway edge's `X-Forwarded-For` behaviour is still unobserved.** Plan Q3 required recording it; the detector half is delivered, the recording half is not | **Owner action before pilot** |
| P9-13 | The rollback drill mutates the parent process env, not a real deploy/restart | P11 |
| P9-14 | The SQL fallback sets `enabled = true` without validating the notice, so the dashboard can show "On" while `resolveNotice` keeps loyalty off; the smoke test surfaces it | Runbook, watch item |
| P9-15 | The SQL fallback overwrites `privacyUrl` with the template value; an unreplaced `<restaurant-domain>` breaks the notice link while loyalty activates | Runbook, watch item |

## Not verified

- Neither rehearsal script was re-executed by a verifier (they write to the DB). The four evidence files are internally consistent — check counts, ordering and format match the scripts line-for-line — but were not independently reproduced.
- The Railway edge behaviour (P9-10).
- The frozen contract §18.20.14 A was not re-read in the verifier's context; the permission split was checked against `TASK.md` and `prisma/seed.ts`.
- A real deploy/restart rollback.

## Residual risk

- **P9-10 is the pilot blocker that remains**: without knowing whether Railway forwards a client address, every pilot caller may share the strictest bucket (10/hour). The warning makes it visible; it does not fix it.
- The drill proves the code path, not the deployment.
- Same-model verification throughout P9; R3 still owes the P11 four-lens pass.
- The `qrorder_dev` reset means the dev database now holds only seed data plus whatever the drills cleaned up.

## Sign-off

P9 is complete. The pilot is a human action: set `LOYALTY_ENABLED`, generate `LOYALTY_PHONE_HMAC_KEY`, enable `LoyaltySettings` for one restaurant, and confirm the edge warning is absent before inviting guests.
