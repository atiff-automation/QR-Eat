# Review 15 — QR-EAT-LOYALTY-PROMO-V1 · P6C1 (QR UI)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6C1
**Verifiers:** `ses_e2a1178b9ffeQ78h2l9bqmSitV` (FAIL) · `ses_e29f4f497ffey5tkkE0AwQInN6` (PASS WITH NOTES) · `ses_e29e3b762ffeDpUMTpJJShBAX8` (final, PASS WITH NOTES)
**Implementer:** `ses_e2a2b7ae0ffelhsSp5qwxGgCvU` (two correction cycles)
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `7f30e60`

## Verdict

**PASS WITH NOTES.** P6C1 closes.

| Item | Value |
|---|---|
| Seven files, combined manifest | `3f259a8e3f4f722097536d15b04bbf03f1dbf69c7cc53b97be11647df5151ac0` |
| Tracked diff (3 files) | `00d55ace4b05794fb66a64fe3f72837c789a2e934c5de422ee53a4c35bc6603a` |

## Delivered

The customer-facing QR flow: rewards rule card on menu and cart, optional phone + consent from the server notice, one quote at review, quote-bound submit, confirmation, and per-error copy. New pure helpers in `src/components/qr/loyalty-checkout.ts`; `LoyaltyRuleCard`, `LoyaltyReview`; additive props on `CartSummary` and `OrderConfirmation`.

## First-pass FAIL and what it caught

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R-01 | **high** | The confirmation claimed "Reward: 10% off, max RM15" on **every** non-reward order — promotion orders and guest orders included — because it fell back to the quote's *rule* label | **FIXED** — only the create response's `rewardLabel` (the server's "reward projected" signal) is used |
| R-02 | **high** | A guest fallback showed a member's "Visit count: 2 of 3" beside "Guest order — no visit tracked" | **FIXED** — progress suppressed for `GUEST` |
| R-03 | medium | Raw `maxLength={16}` truncated long formatted pastes before sanitisation (`+44 (0)20 7946 0958` → wrong number) | **FIXED** — strip then cap |
| R-04 | medium | Stale consent undetected when promotion copy won the message | **FIXED** — structural check `phone && consent && GUEST` |
| R-05 | medium | Cashback / voucher / "Login" rows still shown in loyalty mode, all opening the rewards review | **FIXED** — hidden in loyalty mode, unchanged flag-off |
| R-06 | medium | Focus ring ≈1.36:1 contrast | **FIXED** — `ring-orange-700` (5.18:1) |

## Second-pass findings, also fixed

| ID | Severity | Finding |
|---|---|---|
| M-03 | medium, **common path** | On **every** discounted order the confirmation breakdown did not reconcile: no discount line, so 60.00 + 2.88 + 4.80 = 67.68 was shown against a 55.68 total. Now renders `discountLines` and reconciles. |
| M-01 | medium | Loyalty toggled off between quote and create showed a discounted total for an order created at full price. Now the quote is used only when the create confirmed loyalty. |
| M-02 | medium | A null notice refresh stranded the customer with no cart access. Now returns to cart or menu. |
| L-01/L-02 | low | Guest showed "Visit count: 0 of 3"; legacy create showed a loyalty panel. Both suppressed. |

## Direct answer

**Can a customer be shown a total or a reward they will not receive? — No.** The confirmation renders only server-validated strings from the quote the create actually consumed; a legacy create shows the plain total with no loyalty panel; a reward label appears only when the create projects one.

## Verified

- Flag-off parity: `loyaltyNotice === null` ⇒ unchanged legacy flow, no loyalty UI reachable, same submit body.
- P6C phone rule as approved: `+` first only, digits only, strip on type **and** paste, no fixed `+60`, no masking, no reformatting, 16-char cap after stripping, `inputMode`/`autocomplete="tel"`, concrete `PHONE_INVALID` example.
- No client-side money arithmetic; no hardcoded "3rd"/"10%"/"RM20"/"RM15".
- Phone only in component state and JSON body — never in a URL, query string, log or analytics event.
- `QUOTE_CHANGED` re-quotes and shows "Total updated…"; `loyaltyError` keeps the order as a guest.
- Accessibility: 44px targets, labelled inputs, `role="alert"` errors, `aria-live` status, dark focus ring, `break-words` for long labels.

## Notes carried

| ID | Note | Route |
|---|---|---|
| V-01 | Rule card uses current settings while the review uses the card snapshot; a mid-cycle settings change can disagree | P6C2 / UX |
| V-02 | With loyalty the confirmation shows the whole session bill, not just the created order (intended by the price lock) | Document |
| V-03 | QR create sends no `Idempotency-Key`; a lost response + retry hits `CART_EMPTY`. Inherited from P4; the loyalty path is protected by the single-use quote | **P7** with F-08 |
| V-04 | A quote-endpoint outage blocks QR ordering in loyalty mode (contract requires the quote) | Note |
| V-05 | A projected reward included in the displayed total can differ from an offline-settled amount (acceptance 19) | P5/contract |
| V-07 | No React render tests (jest env is node); JSX wiring proven by inspection and build | Add if jsdom is adopted |

## Not verified

- No browser/E2E run against a live database.
- No React render tests; no axe/Lighthouse; no real-device keypad or paste test.
- Offline settlement path not exercised.

## Residual risk

- Quote outage blocks ordering when loyalty is on (V-04).
- Rule-card vs snapshot divergence (V-01).
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass at the commit gate.
