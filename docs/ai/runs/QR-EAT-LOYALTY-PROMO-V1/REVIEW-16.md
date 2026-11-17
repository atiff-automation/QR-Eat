# Review 16 — QR-EAT-LOYALTY-PROMO-V1 · P6C2a (owner settings + promotions UI)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6C2a
**Verifiers:** `ses_e28e6d7b7ffee1v9V6FFrteaU8` (FAIL) · `ses_e28d2c80fffe9KT7moRUSc2TQ1` (PASS WITH NOTES)
**Implementer:** `ses_e28f9823effeum4cWBAwWdJ6SF`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `db96f5c`

## Verdict

**PASS WITH NOTES.** P6C2a closes.

| Item | Value |
|---|---|
| 20 files, combined manifest | `af958109fc4945cb60253697727821076e58505111c581cc6147564139b2e267` |
| Tracked diff | `ddb34d060087ad5225f1a834a8ce4d2b102018239efc9aba5f47ccac9fd3a930` |

## Delivered

Rewards settings as a section inside `/dashboard/settings` (enable, visits 2–10, type/value/cap, minimum spend, labels, notice + privacy URL), `cashRounding` inside Payment Methods, `/dashboard/promotions` with list + create/edit/soft delete across ORDER/CATEGORY/ITEM using the restaurant's own menu, a "Rewards" nav entry, and the vocabulary added to `GLOSSARY.md` and `docs/TERMINOLOGY.md`.

## First-pass FAIL — and it was only contrast

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R-01 | medium | Success banner `text-green-600` on `bg-green-50` = **3.15:1**, below the plan's 4.5:1 | **FIXED** → `text-green-700` (4.79:1) |
| R-02 | low | Error banners `text-red-600` on `bg-red-50` = 4.41:1, marginally short — and the standard itself prescribes that token | **FIXED** in this phase's files → `text-red-700` (5.91:1); standard note added, other pages untouched |
| R-03 | low | Money-field errors announced but not programmatically associated | **FIXED** — optional `ariaInvalid`/`ariaDescribedBy` on `CurrencyInput` |
| R-04 | low | Loyalty money fields always rendered MYR | **FIXED** — restaurant currency passed in; hardcoded "max RM15" hint removed |
| R-06 | low | Icon-only close lacked `title` | **FIXED** |
| R-07 | low | Queries fired before the permission check (403 GET before the denied state) | **FIXED** — gated on resolved permission |
| R-10 | low | No test for the cash-rounding control | **FIXED** |

The flows were never in question: the verifier confirmed an owner can enable rewards, configure the rule, set cash rounding and create a promotion entirely through the UI.

## All nine acceptance criteria met

1. Enable + every setting saved; bounds rejected both sides ✅
2. In-progress card untouched, and the UI says so ✅
3. `cashRounding` changeable with loyalty off, audited server-side ✅
4. Three scopes, own menu, soft delete with confirmation ✅
5. `endsAt <= startsAt` rejected in the form and by the server ✅
6. Empty / loading / error / permission-denied states ✅
7. No client money arithmetic; 2dp strings ✅
8. Contrast, 44px, labels, keyboard, no colour-only ✅ (after R-01/R-02)
9. Vocabulary in `GLOSSARY.md` and `docs/TERMINOLOGY.md` ✅

## Verified

- `noticeTextHash` never sent — absent from the payload type, the builder, and asserted in tests.
- A fresh `Idempotency-Key` per submit (`crypto.randomUUID()` inside each mutation), never reused.
- Promotion scope switch sends both arrays so switching CATEGORY/ITEM → ORDER clears the old join rows.
- Shared-component changes are strictly optional/additive: `CurrencyInput`, `useRestaurantSettings`, `useMenu`, `query-client.ts` — no existing caller's behaviour changes.

## Notes carried

| ID | Note | Route |
|---|---|---|
| L-01 | The contrast fix has no regression guard | P6C2b (cheap test) |
| L-02 | `WEB-UI-STANDARD.md` still prescribes `red-600` (4.41:1) for every other page | Standards cleanup task |
| L-03 | Permission-denied copy shows raw keys (`loyalty:configure`) | Cosmetic |
| L-04 | The R-10 test is partly a passthrough test | Optional |
| L-05 | Promotions page falls back to MYR for one frame before settings resolve | P6C2b |
| L-06 | **Server default `rewardLabel` is `'10% off, max RM15'`** — currency-hardcoded, and it pre-fills the form for a non-MYR restaurant | P6C2b / P10 |
| L-07 | One-frame `hasChanges` in Payment Methods | Optional |

## Not verified

- No browser/E2E run; no axe or Lighthouse; contrast computed from Tailwind tokens, not measured.
- No React interaction test (jest env is node); submit wiring proven by inspection, type-check and build.
- Actual 403 behaviour for a `promotions:manage`-without-`settings:read` user inferred, not exercised.

## Residual risk

- Currency-hardcoded server default label (L-06) reaches customers of non-MYR restaurants until fixed.
- Standards-wide `red-600` contrast gap (L-02) outside this task.
- Same-model verification shares blind spots.
