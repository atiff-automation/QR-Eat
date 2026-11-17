# Counter Handoff — Loyalty, rewards and promotions v1

**From:** QR-Eat (contract owner)
**To:** Tabtep Counter (Android) — separate session and repository
**Status:** server implemented · **frozen `df40e1d`** (REVIEW-29 FAIL → REVIEW-30 PASS WITH NOTES; P11 human pass PASS, 2026-11-16) · merged, tagged and deployed 2026-11-17 · loyalty flags off, HMAC key unset, pilot pending · credentials not rotated
**Normative source:** `docs/PRODUCT/API-CONTRACT.md` §18.20 addendum, which
records the server implementation of Tabtep `§18.20` (v1.4.3, revision 14).

Build against **this document and the addendum**, not against the raw §18.20
text. Where they differ, the addendum's interpretation register is what the
server actually does.

## The one rule

If a promotion applies to the bill, the promotion applies and the visit does
**not** count; the card stays. No promotion means the visit counts, and the
configured visit applies the reward. There is no customer choice, no cashier
override, and no two-option comparison.

The server is the system of record. The Counter renders state and sends intents.
**Do not compute totals, discounts, rewards or rounding on the client.**

## Endpoints

| Purpose | Endpoint | Key inputs |
|---|---|---|
| Notice for attach | `GET /api/counter/loyalty/notice` | — |
| Bill read | `GET /api/counter/tables/{tableId}/bill` or `/api/counter/orders/{orderId}/bill` | — |
| Attach member | `POST .../member` | `phone`, `consent`, `consentVersion`, `consentTextHash`, `Idempotency-Key`, `expectedBillRevision` |
| Remove member | `POST .../member/remove` | `Idempotency-Key`, `expectedBillRevision` |
| Pay | `POST /api/counter/orders/{orderId}/pay` or `POST /api/counter/payments` | `method`, `expectedTotal`, `expectedCashPayable`, `expectedBillRevision`, `cashReceived`, `Idempotency-Key` |
| Replay a stored payment | `GET /api/counter/payments/{key}` | — |
| Modify an unpaid order | `PATCH /api/orders/{id}/modify` | body: `idempotencyKey`, `version`, `reason`, `customerNotified`, `itemChanges` |
| Day reports | `GET /api/counter/reports/day` and the Z | — |

`expectedTotal` is always `projectedTotal` from the bill — never a pre-reward
total. For cash, `expectedCashPayable` is `cashPayable`; card and e-wallet
charge `projectedTotal` exactly.

**Modify is a body contract.** `PATCH /api/orders/{id}/modify` takes no
`Idempotency-Key` header. Send `idempotencyKey` (UUID) in the JSON body together
with `version` (the order version the cashier saw), `reason`
(`out_of_stock` | `customer_request` | `kitchen_error` | `other`),
`customerNotified` (boolean) and `itemChanges` (at least one
`{ itemId, action: 'remove' | 'update_quantity', newQuantity? }`). A request that
follows an `Idempotency-Key` header instead gets a 400.

> The owner confirmed the body contract on 2026-11-17 (`OI-1`): the form above is
> the contract, and the addendum's surface table has been corrected to match. No
> server change was made; the frozen commit `df40e1d` remains valid.

**Notice response shape.** `GET /api/counter/loyalty/notice` returns:

```json
{
  "success": true,
  "enabled": true,
  "notice": {
    "version": "v1",
    "text": "…",
    "textHash": "…",
    "privacyUrl": "https://…",
    "termsText": "…"
  }
}
```

Map it to the attach body as `version` → `consentVersion` and `textHash` →
`consentTextHash`. When loyalty is off the route is a normal `200` with
`enabled: false` and `notice: null`; do not attach, and render the neutral
disabled state. A missing or stale `textHash` is `CONSENT_STALE`, never a
client-side guess.

## Bill fields the Counter must render

`billRevision`, `member { id, name, maskedPhone, completedVisits,
visitsRequired }`, `visitState`, `promotionApplied`, `promotionScope`,
`promotionLabel`, `promotionItems[]`, `promotionDiscountAmount`,
`discountAmount`, `discountSource`, `discountLabel`, `discountLines[]`,
`rewardLabel`, `rewardType`, `rewardValue`, `maxDiscount`, `subtotal`,
`taxAmount`, `serviceCharge`, `fullPriceTotal`, `preRewardCashPayable`,
`projectedRewardAmount`, `projectedTotal`, `preRewardTotal`, `totalAmount`,
`cashPayable`, `daySubtotal`, `minDailySpend`, `amountToMinimum`.

- `totalAmount` = `projectedTotal` — what to collect online.
- `preRewardTotal` / `preRewardCashPayable` — offline collection of an
  online-priced order.
- `fullPriceTotal` — offline-created order only.
- `promotionApplied = true` implies `projectedRewardAmount = "0.00"`.

## State → copy

Use the values from the bill; never hardcode "3rd", "10%" or "RM20".

| State | Counter copy |
|---|---|
| `COUNTS` | "Visit counted: {completed} of {required}." |
| `REWARD_APPLIED` (payment) | "{rewardLabel} applied; card resets." |
| `PROMOTION` (member) | "Promotion applied; visit not counted; card stays at {completed} of {required}." |
| `PROMOTION` (guest) | "Promotion applied. No visit tracked." — omit card copy |
| `BELOW_MINIMUM` | "Spend RM {amountToMinimum} more today to make this visit count." |
| `ALREADY_COUNTED` | "Today's visit is already counted." |
| `GUEST` | "Guest order — no visit tracked; staff can attach at the counter." |
| Disabled | "Loyalty is off for this restaurant." |
| No permission | "You do not have permission to change the member." |

Payment `outcome` precedence: `PROMOTION_APPLIED > REWARD_APPLIED >
VISIT_COUNTED > ALREADY_COUNTED > BELOW_MINIMUM > GUEST > NO_BENEFIT`.

## Flows

**Dine-in, member attached.** Bill read shows the member, visit count and any
promotion. Payment sends `expectedTotal`/`expectedCashPayable`/
`expectedBillRevision`. The response carries `outcome`, `completedVisits`,
`visitsRequired`, `cardReset`, `discountAmount`, `projectedTotal`,
`cashPayable`, `changeGiven`.

**Guest.** No member fields. If the cashier attaches a member, the server
re-quotes and reprices; the bill revision changes, so re-read the bill before
tendering.

**Promotion.** The bill shows the promotion and "visit not counted". Payment
records the promotion and writes no visit. To make the visit count, the cashier
modifies the unpaid order with `PATCH /api/orders/{id}/modify` (removes the
eligible items). The server re-evaluates the promotion, replaces or removes the
ACTIVE discount, recomputes tax/service per order and bumps `billRevision`; then
re-read the bill before tendering.

**3rd visit.** The bill projects the reward in `projectedTotal`. Payment applies
exactly that projection. If the projection is invalidated (card changed, already
counted, revision moved), payment returns `BILL_CHANGED` or `AMOUNT_MISMATCH`
**before** charging; re-read the bill and re-tender. Never collect a pre-reward
total.

**Offline.** Offline-created order: full price, no promotion, no visit.
Online-priced order paid offline: keep the promotion, collect `preRewardTotal`
(or `preRewardCashPayable`), no reward, no visit. A queued payment carrying a
projected reward is rejected or flagged for reconciliation — never settled
silently. Show "Loyalty unavailable offline." An offline replay must **omit**
`expectedTotal` when it is unknown: sending `null` is a 400 request error, not
`BILL_CHANGED`.

## Client-visible changes from the current Counter

| # | Change | Action |
|---|---|---|
| 1 | **The Z's `grossSales` is now the pre-tax subtotal** (P8-1) | Do not label it "total sales". Show tax and service separately. |
| 2 | `PaymentBatch.outcome` is a new non-null value on new batches (P9-09), including `GUEST` when loyalty is off | Tolerate the field; do not infer loyalty state from it. |
| 3 | Stored and replayed payment bodies omit `customerName`/`customerPhone` (P10-3) | Do not read those fields on replay. |
| 4 | Payments `PUT` accepts a missing `Idempotency-Key` (P10-7) | Always send it anyway; a retry without it is unprotected. |
| 5 | The QR confirmation shows the whole session bill (P10-10) | The displayed total may exceed the created order. |
| 6 | A projected reward can differ from an offline-settled amount (P10-11) | Reconcile; never assume the projection was collected. |

## Error handling

| Code | Counter action |
|---|---|
| `BILL_CHANGED` / `AMOUNT_MISMATCH` | Re-read the bill; re-tender. "Not charged." |
| `BILL_PAID` | The bill is already paid; refresh. |
| `PAYMENT_IN_PROGRESS` | Reload the bill, then `GET /api/counter/payments/{key}` to read the stored outcome. If it is still in progress, use a **new** idempotency key for the next attempt. Do not retry with the same key: the record stays in progress for 24h, so that retry cannot succeed. |
| `QUOTE_CHANGED` | Re-quote (QR only). |
| `CONSENT_REQUIRED` / `CONSENT_STALE` / `CONSENT_VERSION_REQUIRED` | Show the notice; re-capture consent. The bill stays `GUEST`. |
| `INSUFFICIENT_CASH` | Re-enter the cash received. |
| `CASH_ROUNDING_FAILED` | Use card or call a manager. |
| `PERMISSION_DENIED` | Hide or disable the action. |
| 403 on a bill read | A cross-tenant staff/owner hit the legacy bill guard. Do not retry; refresh the session. (Member and loyalty routes return 404 instead.) |
| `RATE_LIMITED` | Show `retryAfterSeconds`. |
| `LOYALTY_DISABLED` | Render the neutral disabled state; the bill is still payable. |
| `CUSTOMER_CONFLICT` | The member could not be saved. Re-search the member by phone; retry once. If it persists, continue as a guest bill and take payment normally. |
| `CONFLICT` | An owner mutation (settings, promotions, members) hit a unique conflict. Re-read the current state and retry with a **fresh** idempotency key; never reuse a key with a changed body. |
| `RESTAURANT_HAS_HISTORY` | **Owner/admin surface only** — `DELETE /api/restaurants/{id}`. The Counter never receives it. Close the restaurant with `isActive: false`; do not retry the delete. |
| `BUSINESS_DAY_BLOCKED` | Close refused. Read `details.blockers`; each entry has `type`, `label`, `count` and `amount`. Do not edit figures. Blocker types: `Z_DISCOUNT_SPLIT_MISMATCH` (the discount total does not match the promotion + reward rows) and `Z_IDENTITY_MISMATCH` (the revenue identity does not reconcile). Surface the `label` and `amount`; escalate. A third type, `AFTER_CLOSE_ACTIVITY`, is informational: it can appear on an already-closed day's live Z when a payment or refund was taken between the close and the cutoff. It never blocks a close; show it as a note, not an error. |

## Do not

- Recompute subtotal, discount, tax, service, total or cash rounding.
- Subtract a discount twice when a cached bill is merged with a fresh one.
- Apply a reward or write a visit offline.
- Treat `promotionApplied` as the only state signal — use `visitState`.
- Send marketing consent from the QR; it is Counter-only and requires an actor.
- Persist the full phone. The bill returns only `maskedPhone`; the full phone is
  on `GET /api/members/{id}` and requires `members:pii`.

## Build checklist

- [ ] Bill model tolerates every additive field and a missing member.
- [ ] `visitState` drives copy, not `promotionApplied`.
- [ ] Payment sends `expectedTotal`, `expectedCashPayable`, `expectedBillRevision`.
- [ ] Payment result renders all seven `outcome` values.
- [ ] `BILL_CHANGED` path re-reads and never retries the charge blindly.
- [ ] Offline collection uses `preRewardTotal`/`preRewardCashPayable`.
- [ ] Z shows pre-tax gross, tax, service, discounts, refunds and the identity.
- [ ] Replay path never reads name/phone from a stored payment body.
- [ ] Every mutating call sends an idempotency key.
- [ ] Accessibility: status announcements, contrast, 48dp targets, font scale.

## Open questions for the Counter session

1. Which Counter build first ships the loyalty fields, and does it ship with
   loyalty disabled until the pilot restaurant is enabled?
2. Does the Counter need the member's visit count on the order list, or only on
   the bill?
3. Does the Z screen show the refunds line, or only net?
