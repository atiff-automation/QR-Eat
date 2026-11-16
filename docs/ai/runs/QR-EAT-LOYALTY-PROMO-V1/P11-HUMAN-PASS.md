# P11 human pass — payment and migration paths

**Why this exists.** Every review in this task ran on the same model. The one independence that
cannot be shared is a human reading the money path. This is P11-2 and it is a condition of the
freeze stamp.

**What to do.** Read the ten scenarios. For each, the expected result is stated with the file or
test that proves it. If any expected result disagrees with what you believe the restaurant should
do, stop and say so — do not sign.

**Code tip:** `2ba40f0` + P11-fix `df40e1d` · **Evidence:** `REVIEW-29`, `REVIEW-30`,
`evidence/P9-*.txt`, `REVIEW-28`.

---

## 1. Two payments on one bill

A cashier taps Pay twice, or two devices tender the same bill.

**Expected:** one `PaymentBatch`, one `Payment`, one visit at most; the loser gets `BILL_PAID` or
`BILL_CHANGED` and is **not** charged. **Proof:** `REVIEW-28`, drill 1; `loyalty-payment-service`
lock + `paymentStatus` guard.

## 2. A promotion applies

The customer ordered an item covered by an active promotion.

**Expected:** the promotion is applied automatically, the visit **does not** count, the card stays
at its current count, and `outcome = PROMOTION_APPLIED`. A promotion and a reward never appear
together. **Proof:** `loyalty-payment-service.ts` promotion/visit rule; `REVIEW-29` clean list.

## 3. The third visit

No promotion, and this is the member's third qualifying visit.

**Expected:** the reward is applied, the card resets, `outcome = REWARD_APPLIED`. If the projection
is stale (card changed, already counted, revision moved), payment returns `BILL_CHANGED` or
`AMOUNT_MISMATCH` **before** charging. **Proof:** `visit.ts`, payment projection validation.

## 4. A refund day

A sale on Monday is fully refunded on Tuesday.

**Expected:** Tuesday's Z shows `gross 0`, `refunds 115`, `net −115`; the P&L and the loyalty
report agree; `refundsPriorPeriod` equals the refund. Monday's report is unchanged. **Proof:**
`REVIEW-22`, `REVIEW-27`, `counter-reporting.test.ts`.

## 5. An early close

The restaurant closes at 01:00 although the 04:00 cutoff has not passed, and a refund happens at
02:00.

**Expected:** the day's reports cover the **cutoff** window, so the refund is included; the Z shows
`AFTER_CLOSE_ACTIVITY`; the filed Z snapshot does not change. **Proof:** `REVIEW-28`, P8-8 tests.

## 6. Cash rounding

The owner sets rounding to `NEAREST_5_SEN` and takes cash on a total ending in 3 sen.

**Expected:** cash payable is rounded, `roundingAdjustment` is recorded, change is computed from
the rounded amount, and the drawer reconciles (`Σ cashPayable = Σ cashReceived − Σ changeGiven`).
Under `NONE`, the exact total. Card never rounds. This now applies **with loyalty off too**.
**Proof:** `payment-batch-rounding.test.ts`; `REVIEW-30` B-PAY-1.

## 7. An offline order replayed later

An order is created offline at 23:00 and replayed at 10:00 the next day.

**Expected:** the sale is attributed to the **offline** business date in the Z, the P&L and the
loyalty report; an offline-created order is full price with no visit; an online-priced order keeps
its promotion and collects `preRewardTotal`; a replay without `expectedTotal` is refused. **Proof:**
`report-attribution.test.ts`; `REVIEW-30` B-PAY-2/B-PAY-4.

## 8. Rollback

Unset `LOYALTY_ENABLED` and redeploy.

**Expected:** no loyalty rows are written, the legacy payment path runs, cash rounding still
applies, and existing visits/discounts remain. **Proof:** P9 drill 5; `REVIEW-23`.

## 9. Closing versus deleting a restaurant

The owner closes the restaurant for good.

**Expected:** closing is `isActive: false` — the restaurant disappears from public and owner lists,
history is retained. `DELETE` is refused with `409 RESTAURANT_HAS_HISTORY` when there is any
financial or loyalty history. **Proof:** `REVIEW-28`, `DATA-RETENTION.md`.

## 10. Permissions and migration

- A **manager** cannot change tax or service charge on either settings route; the **owner** can.
- The ten loyalty permissions exist after a seed, with `members:export` and `members:delete`
  owner-only.
- Fresh and upgrade migrations pass; rollback works; the menu/security index build is noted in the
  runbook.

**Proof:** `REVIEW-30` H-1; P9 9a/9b/9e; `PILOT-RUNBOOK.md`.

---

## What I am signing

| Decision | Meaning |
|---|---|
| **PASS** | The ten scenarios match what the restaurant should do. Stamp the freeze. |
| **PASS WITH NOTES** | They match, but a scenario needs a follow-up. Record it and stamp. |
| **FAIL** | At least one is wrong. Do not stamp; open a fix. |

**Name:** ______________________  **Role:** ______________________  **Date:** ____________

**Decision:** PASS / PASS WITH NOTES / FAIL

**Notes:**

```text


```
