# Review 29 — QR-EAT-LOYALTY-PROMO-V1 · P11 (four lenses)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P11
**Staffing:** lens A and lens B by DeepSeek V4.1 Flash (fresh sessions,
`ses_e1d07cab5ffeafh87cqKdFhmx3`, `ses_e1cef1f11ffeOsZ3u5FVIwXfmk`); money path by
`opencode-go/glm-5.3` (`ses_e1cd7995fffe0OaLjmdEPKhNkL`). Human pass pending.
**Date:** 2026-11-16 · **Risk:** R3 · **Base:** `4bc09c1` · **Code tip:** `2ba40f0`

## Verdict

**FAIL — do not freeze.** Eight findings block the freeze; the rest are fixable in one phase or
recordable. The money path itself is sound (lock order, atomicity, no double-charge); the failures
are at the edges: a customer dead-end, a permission escalation, an availability attack, a contract
contradiction, and one cross-date race.

## Blockers

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **B-UX-1** | **H** | A guest quote plus any phone is rejected `QUOTE_CHANGED` (409). The addendum promises a 200 guest order with `loyaltyError`. The shipped QR client always sends the phone, even with consent unticked, and re-quotes with the same phone — so **a customer who declines consent can never place the order**, and sees "Total updated" when nothing changed. | `loyalty-qr-service.ts:1215-1227`; `loyalty-checkout.ts:322-346`; addendum §18.20.3 |
| **S-1** | **M** | The `manager` role now holds `settings:write`, which also gates the financial settings route — tax rate, service charge, labels. The contract names `settings:write` only for payment settings. A manager can change tax. | `prisma/seed.ts:1174`; `settings/restaurant/financial/route.ts:25` |
| **S-3** | **M** | The restaurant bucket is incremented first for every phone-bearing request, before the phone is normalised. One IP sending ~30 malformed phones denies loyalty pricing for the whole restaurant for an hour. | `rate-limit.ts:254-291,336` |
| **B-PAY-1** | **M** | Cash rounding is inert when loyalty is off: the legacy path never reads the cash-rounding setting, charges the exact total, writes no `cashPayable`/`roundingAdjustment`, and the Z reports "Not checked (legacy)". The addendum and the settings UI both say rounding is independent of loyalty. | `payment-batch-service.ts:224-233,418-457`; addendum §18.20.1 |
| **B-PAY-7** | **M** | Cross-cutoff double reward: the day lock is keyed on the payment's business date, so two bills for the same member either side of 04:00 take different day locks, both read the card at 2-of-3 and both apply the reward + reset. | `loyalty-payment-service.ts:1873-1881,1365-1389` |
| **S-2** | **M** | The example env file documents `LOYALTY_PHONE_HASH_KEY`; the code, contract and runbook use `LOYALTY_PHONE_HMAC_KEY`. The file is git-ignored, so the new variables have no tracked documentation. An operator following it gets a silent guest fallback and a 500 on Counter attach. | example env line 98; `phone.ts:114` |
| **B-PAY-4** | **M** | An offline replay does not require `expectedTotal`; without it a projected reward is settled at the pre-reward total instead of being rejected or flagged. | `loyalty-payment-service.ts:1976-2009` |
| **B-PAY-2** | **M** | An offline-created order replayed after the cutoff writes the batch on the offline date and the payment on the replay date; the Z and P&L range by `createdAt`, the loyalty report and the Z cash block by `businessDate`. The three reports disagree for that order. | `loyalty-payment-service.ts:2142-2163`; `counter-report-service.ts:346-355,898-910` |

## Fix before pilot (one phase)

| ID | Sev | Finding |
|---|---|---|
| B-PAY-3 | L | `expectedCashPayable` is optional; a stale cash total with an unchanged `expectedTotal` is accepted. Require it for cash when loyalty is active, or register the optionality. |
| B-PAY-5 | M | The handoff says "retry `PAYMENT_IN_PROGRESS` with the same key"; a generic failure leaves the record in progress for 24h, so that retry cannot succeed. Fix the handoff and consider a startup sweep. |
| B-PAY-6 | M | The QR-create bill lock and revision bump are inside `if (plan)`; a quote-less create while loyalty is active takes neither. Take them for every create into an open session, or register the hole. |
| B-UX-2 | M | The handoff lists the notice endpoint with no response shape; attach needs `version` mapped to `consentVersion` and `textHash` to `consentTextHash`. |
| B-UX-3 | M | The handoff says `Idempotency-Key` for order modify; the route requires `idempotencyKey` in the body plus `version`, `reason`, `customerNotified`, `itemChanges`. A Counter following the handoff gets a 400. |
| D-2 | M | Quotes and idempotency records are never pruned; expired quotes and completed records accumulate from a public path. |
| D-3 | M | The dev PII cleanup rewrites every tenant's payment responses with no date bound, dry-run or rows-affected report. |
| D-6 | L | Plain unique-index creation on the existing menu tables inside the migration transaction; add a deploy note. |

## Record only

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| D-1 | M | No 24-month inactive-member anonymisation job (contract §18.20.9). | Register with an owner and a pilot-decision date, or schedule it. |
| D-4 | L | The live Z for pre-feature days shows zero tender because the batch business date is null on old rows. | Record; the filed snapshot is unaffected. |
| D-5 | L | The migration drops the old array columns unconditionally; safe because they were unwritable, argued not proven. | Record with the reasoning. |
| S-4 | L | The enumeration refusal path serialises on a per-subject lock and scans the events table. | Backlog. |
| S-5 | L | A platform admin bypasses the member PII permission if a token carries a restaurant context. | Assert the user type in the member routes, or record. |
| S-6 | L | A fresh consent proof clears the withdrawal timestamp; anyone who knows the phone can undo a withdrawal. | Record as accepted risk, or require an actor. |
| S-7 | L | The delete pre-check does not count security events (no FK), leaving orphaned rows. | Add the count or an FK. |
| B-UX-4 | L | The handoff's guest-promotion copy row never renders; a guest promotion bill is `visitState: GUEST`. | Fix the handoff copy. |
| B-UX-5 | L | A client-visible field is described as returned under flag-off; it is only in the database. | Fix the handoff or add the field. |
| B-UX-6 | L | The order-contact-phone distinction is in the addendum but not the handoff. | Add one line. |
| B-UX-8 | L | The P&L caption says figures include tax beside a pre-tax gross figure. | Reword. |

## Verified clean

- **Lock order and deadlock freedom:** day → bill in payment and modify; member attach takes only the bill lock; QR create takes the tables row then the bill; no reverse edge.
- **Atomicity:** batch → visit → card → ledger → orders → session → payments → audit → idempotency, one transaction; write identities re-checked before commit.
- **No double-charge path:** same key replays; different key on a paid bill returns `BILL_CHANGED`/`BILL_PAID`.
- **Promotion/visit rule:** precedence correct; promotion and reward never coexist; the reset is driven by the next card state.
- **Tenant isolation:** every loyalty query is restaurant-scoped; composite FKs; cross-tenant 404 except the recorded bill-route 403.
- **PII:** keyed HMAC, masking, permission gating, audit rows hash-only, no raw header outside the resolver.
- **Migrations:** additive apart from the documented array-column drop; no backfill; CHECKs and partial uniques as designed.

## Not verified

- No live database, migration apply or rehearsal run. The migration and lock conclusions are from code and the recorded P9 evidence.
- The Counter client does not exist; handoff findings are judged against the server and the document.
- The raw normative contract was not re-read by the money-pass lens; it checked the addendum against the implementation.
- The human pass on the payment and migration paths is **pending** and is a condition of the freeze.

## Residual risk

- The same-model lenses share blind spots; the different-family pass is what caught the guest dead-end's client loop and the cross-cutoff race.
- **B-UX-1** is the one a real customer would hit first. It must be fixed or the addendum amended before any pilot.
- The freeze hash is not stamped; the addendum still names the P10-close candidate, which the stamp corrects.
