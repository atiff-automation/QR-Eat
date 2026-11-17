# Review 04 — QR-EAT-LOYALTY-PROMO-V1 · P2 (pricing engine)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P2
**Verifiers:** `ses_e2d80edefffeqjhnMCswstMOQH` (P2 full) · `ses_e2d62bad1ffeiujvlS3T8qONA4` (P2 delta)
**Implementer:** `ses_e2d90c157ffedh0iNsagr0ZJjQ`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `fc1312a`

## Verdict

**PASS WITH NOTES.** Correction cycles 1 and 2 applied.

| Item | Value |
|---|---|
| `src/lib/loyalty/**` (12 files, post cycle 2) | `012bef37f708bed71c1f3e4abed53bb87052fe4fc6cb95f8c20cc6e84f84c36a` |
| `src/lib/loyalty/*.ts` (source only, post cycle 2) | `9aacc267a1907dce15d374837f1be5ac6fd866f0395f21d831fe194699f9898d` (pre-cycle-2 source) |
| Tracked product diff | `b6bd9c3b6004a90b1e2a16a4740fbf8f4b14b4bd1d48b5b8d5791f7266263be8` |

## First-pass findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | medium | `projectReward` ignores `maxDiscount` for `FIXED` rewards, while `evaluatePromotion` caps `FIXED`. | **OPEN — product decision.** Implementer correctly left it untouched. |
| F-02 | medium | Two sources of truth for "below minimum"; `resolveOutcome` took a caller-supplied boolean, so a guest could become `BELOW_MINIMUM`. | **FIXED** — `resolveVisitOutcome` derives both from one `resolveVisitState`; 64/64 combinations verified. |
| F-03 | medium | `projectReward` had no promotion guard; §18.20.15 C forbids a reward and promotion together. | **FIXED** — required `hasPromotion`; 45/45 cases return `0.00`/`applies:false`. |
| F-04 | medium | QR copy let the phone prompt and generic error beat guest+promotion copy. | **FIXED** — promotion copy wins; all §18.20.14 K codes mapped. |
| F-05 | low | `promotionScope` could not express bill-level `MULTIPLE`. | **FIXED** — widened; mixed-bill copy on quote/bill/payment. |
| F-06 | low | `PERCENT > 100` could emit `discount > base`. | **FIXED** — clamped to the eligible base. |
| F-07 | low | `toMoneyString` used half-up `toFixed(2)`. | **FIXED** — floors. |
| F-08 | low | `allocateReward` did not floor order subtotals. | **FIXED** — floors before allocating. |
| F-09 | low | Negative subtotal breaks parity silently. | **FIXED** — precondition documented + asserted. |
| F-10 | low | Half-open `[startsAt, endsAt)` undocumented; date-only `endsAt` ends a promotion a day early. | **FIXED** — documented; P6 must store end-of-day. |
| F-11 | low | Payment copy deviated from §18.20.15 E; receipt ASCII test could not fail. | **FIXED** — exact string; receipt transliterates, test red-capable. |
| F-12 | low | No P2 entry in `RUN_LOG.md`; `NEXT.md` stale. | **FIXED** by Lead. |
| F-13 | info | `docs/ai/ACTIVE.md` outside the product hash. | No action. |

## Delta findings (post cycle 1) and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R-01 | low | Clamp could return a 3dp discount when the eligible base was 3dp, breaking the `OrderDiscount` cent identity at persistence. | **FIXED** — base floored; 3dp tests added. |
| R-02 | low | `loyaltyDisabled` precedence differed by surface (quote/payment showed promotion copy while bill/receipt said disabled) — introduced by the F-04 reorder. | **FIXED** — disabled wins on all four surfaces; one test each. |
| R-03 | low | The 3dp allocation test was not red-capable (same result under both algorithms). | **FIXED** — discriminating case `0.010/0.011`, reward `0.01` → `0.01/0.00`; implementer demonstrated the unfloored algorithm gives `0.00/0.01`. |
| R-04 | medium (process) | The P2 delta was untracked, so "what changed" could not be proven — only the post-state. | **OPEN.** Needs a checkpoint commit to bind future reviews to a diff. |
| R-05 | medium (evidence) | The delta brief omitted the F-09/F-10 text, so the verifier could not confirm those two. | **Lead error.** Both were in the cycle-1 brief and are recorded above; treat as verified by implementer + cycle-1 description, not independently re-checked. |

## Independently verified by the verifiers

- Zero-discount parity: 84 targeted combinations + 2,000 random carts, 0 divergences; contract worked example `60.00 − 12.00 @ 6%/10% → 48.00 / 2.88 / 4.80 / 55.68`, `round5 → 55.70`.
- `floor2` true floor incl. negatives; `round5` boundary table incl. `.005/.025/.075`, `-0.025`, and no `-0.00`.
- Allocation: exhaustive 2-order sweep (8,800 runs) and randomized 3dp sweep (19,959 runs), 0 throws, 0 overruns, all 2dp.
- Precedence brute force: 64/64 visit-state and outcome combinations.
- No `Number`/`parseFloat`/`Math.` in money paths; no Prisma/DB/route imports; no new dependency; `order-utils.ts` unmodified.

## Not verified

- The composition in P4/P5 (bill-level `discountAmount`, per-order tax sum, `projectedTotal`, `preRewardTotal`, `cashPayable`, `roundingAdjustment`, mixed-rate aggregation).
- API payloads, error envelopes, DB aggregation (`daySubtotal`), locks, ledger rows.
- A third independent pass after cycle 2: the R-01/R-02/R-03 fixes are implementer-reported with tests, reviewed only against their descriptions.

## Residual risk

- **F-01 is a live money decision:** a FIXED reward is not capped. If the product intends `maxDiscount` to cap it, every fixed-reward bill is over-discounted.
- P5 can still re-introduce divergence by passing floats, skipping `resolveVisitOutcome`, or omitting `hasPromotion` (the type prevents the last one).
- `NaN` in `value`/`maxDiscount` projects `applied:true` with `NaN` until P6 validates.
- Receipt ASCII transliteration is lossy for non-Latin labels.
- Untracked work: losing the working tree loses P2.

## Correction cycle 3 — F-01 (final)

**Verifier:** `ses_e2d437e2affeYGfEQViy33f7aK` · **Verdict: PASS WITH NOTES.**

Human decision: `maxDiscount` caps **both** reward types. `projectReward` now computes
`FIXED` as `min(value, subtotal, maxDiscount)`, floored, clamped to `[0, subtotal]`, with
`applies: false` when the amount is zero. Exactly two files changed (`reward.ts`, its test).

```text
npx jest src/lib/loyalty --runInBand   -> 6 suites, 172 tests, pass
npm run type-check                     -> PASS
npm test -- --runInBand                -> 63 passed / 1 skipped suites, 696 passed, 11 skipped
```

| Item | Value |
|---|---|
| `src/lib/loyalty/**` final | `b1b452e11e451eedbe4606b4b54ea6cb946656892c6d3ccfb722b83ffc49c42d` |
| `PERCENT` parity, valid domain | 6,320 cases, 0 divergences |
| `FIXED` formula sweep | 720 cases, all 2dp, clamped, `applies` correct |

Notes carried:

- **N-1** — capping then flooring differs from flooring then capping only for a synthetic
  3dp `maxDiscount` (`15.005`). Unreachable from `Decimal(10,2)` storage; the new value is
  the correct 2dp one.
- **N-2 (P4/P5 obligation)** — `applies` now means "non-zero reward projected", while
  `nextCardState.resets` means "cycle completes". P4/P5 must pass `projection.applies` as
  `rewardApplied` **and** drive the card reset from `nextCardState`, never from `applies`;
  otherwise a zero-reward completing visit would silently not reset. Verified safe inside
  P2: a zero-reward completing visit yields `VISIT_COUNTED` with `resets: true`.
- **N-3** — bookkeeping, fixed in this pass.

**P2 gate: PASS WITH NOTES.** F-01 closed.
