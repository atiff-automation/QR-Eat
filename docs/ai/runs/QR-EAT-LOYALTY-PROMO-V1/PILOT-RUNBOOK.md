# Pilot Runbook — Loyalty, Visits and Promotions v1

**Audience:** the person enabling the loyalty pilot for one restaurant. You do
not need to have read the implementation task. Follow the steps in order.

**Scope:** one restaurant, one deployment. The feature is default-off and
fail-closed: if either switch is missing, loyalty does not run.

**What the feature does:** a customer can join with a phone number and consent.
A paid visit counts on their card. When the card reaches the configured number
of visits, the reward applies and the card resets. If a promotion applies to the
order or bill, the promotion applies and the visit does not count. There is no
cashier choice and no customer choice.

**What it does not do:** points, tiers, cashback, coupons, stacking, split-bill
allocation, offline loyalty, or post-payment correction. Do not promise those.

---

## 1. Before you start

1. Confirm the deployment runs `npm run start`. That command is
   `prisma migrate deploy && next start`, so the loyalty migrations run on every
   deploy. `railway.json` sets `numReplicas: 1`; do not raise it during the
   pilot (the rate-limit cleanup job assumes one instance).
2. Take a database backup. The migration is additive and needs no backfill, but
   a backup is still the first rollback step for any production change.
3. Have the restaurant's owner dashboard login ready.
4. Generate a phone HMAC key **once** for this deployment:

   ```bash
   openssl rand -hex 32
   ```

   Put the value only in the hosting provider's secret/environment settings.
   Never commit it, paste it into chat, print it in a log, or reuse the value
   from another environment.

5. **Seed the loyalty permissions on a fresh database.** The ten loyalty
   permissions exist **only** in `prisma/seed.ts`; no migration inserts them.
   On a fresh database — a new environment, or after `prisma migrate reset` —
   run:

   ```bash
   npx prisma db seed
   ```

   **before** enabling loyalty. Without those rows the Rewards section is
   missing or cannot be saved. To verify the role mapping when the section
   misbehaves, run:

   ```sql
   SELECT rp."roleTemplate", rp."permissionKey"
   FROM role_permissions rp
   WHERE rp."permissionKey" IN (
     'loyalty:attach', 'loyalty:configure', 'loyalty:report',
     'promotions:manage', 'members:read', 'members:pii', 'members:export',
     'members:delete', 'members:consent_withdraw', 'settings:write'
   )
   ORDER BY rp."roleTemplate", rp."permissionKey";
   ```

   Expect the owner to have all ten and the manager all except
   `members:export` and `members:delete`. If the rows are missing, re-run the
   seed before changing any role.

---

## 2. Deploy with loyalty off

1. Set the secret `LOYALTY_PHONE_HMAC_KEY` in the hosting provider. Do **not**
   set `LOYALTY_ENABLED` yet.
2. Deploy the release. The start command applies migrations.
3. Confirm:
   - the health check passes (`/api/health`);
   - the deployment log does not contain the key;
   - the owner dashboard loads.

---

## 3. Configure the one pilot restaurant

Use the owner dashboard: **Settings page → Rewards section** (not the top-level
Rewards nav item). The server derives the notice hash; do not type a hash.

Set:

| Setting | What to enter |
|---|---|
| Enable rewards | **On** (this is `LoyaltySettings.enabled`) |
| Visits required | 2–10. The contract default is 3. |
| Reward type | Percent or fixed amount. |
| Reward value | Percent 0–100, or a fixed amount greater than zero. |
| Maximum discount | The cap. The contract example is RM15. |
| Minimum daily spend | 0–1000. Below this, the visit does not count. |
| Reward label | What the customer sees, for example “10% off”. |
| Receipt label | Up to 20 ASCII characters. |
| Notice version | A short version string, for example `2026-11`. |
| Notice text | The consent notice the customer reads. |
| Privacy URL | A reachable privacy page. |
| Terms text | Optional. |
| Loyalty orders per hour | The per-restaurant ceiling. Default 30; range 1–1000. Raise it for a busy venue. |

The other limits are fixed and are not editable:

- 10 phone lookups per phone per hour;
- 10 per QR session per hour;
- 120 per trusted edge IP per hour;
- 10 per shared unknown-address bucket (the strictest limit) when the edge
  supplies no address.

Saving settings affects **new cycles only**. A card that is already in progress
keeps the rule it started with.

**SQL alternative (only if the dashboard is unavailable).** Read the restaurant
id first, then update the existing settings row. This template deliberately
leaves the notice — `noticeVersion`, `noticeText` and `noticeTextHash` — alone.
The server derives `noticeTextHash` from `noticeText` when the dashboard saves
the notice, and a hand-written text would silently break that pair:
`resolveNotice` returns null when the stored hash does not match the stored
text, which disables loyalty for that restaurant. Never edit `noticeText` or
`noticeTextHash` by hand; they must always change together, and only the
dashboard does that.

```sql
SELECT id, name, slug FROM restaurants WHERE slug = '<restaurant-slug>';

UPDATE loyalty_settings
SET enabled = true,
    "visitsRequired" = 3,
    "lookupLimitPerHour" = 30,
    "rewardType" = 'PERCENT',
    "rewardValue" = 10.00,
    "maxDiscount" = 15.00,
    "minDailySpend" = 20.00,
    "rewardLabel" = '10% off',
    "privacyUrl" = 'https://<restaurant-domain>/privacy',
    "updatedBy" = '<your-operator-id>',
    "updatedAt" = now()
WHERE "restaurantId" = '<restaurant-id>';
```

The fallback enables loyalty only when the row already holds a notice saved from
the dashboard. If `noticeText` is still null, loyalty stays off (fail-closed):
save the notice — version, text and hash — in the dashboard before the smoke
test. If there is no row, use the dashboard to create it; do not hand-build a
row without the notice hash.

---

## 4. Turn the global switch on

1. Set `LOYALTY_ENABLED=true` in the hosting provider (exact lower-case
   `true`; `1`, `TRUE` and `yes` are treated as off).
2. Redeploy or restart. Both switches are now on for the pilot restaurant only.
3. Check the edge address on the **public** URL, not the internal healthcheck
   log. Call `/api/health` from outside, for example:

   ```bash
   curl -s https://<public-host>/api/health
   ```

   Read the `edgeIp` block in the response:

   - `source: "x-real-ip"` with `xffEntries: 2` is healthy: the edge supplied
     the client in `X-Real-IP` and prepended it to `X-Forwarded-For`.
   - `source: "unknown"` with `xffEntries: 0` means the edge is not providing
     client headers. Loyalty still works, but every caller shares the strictest
     rate-limit bucket. Treat this as a blocker for a busy pilot and ask
     engineering to fix the proxy header.

   The healthcheck itself may legitimately show `source: "unknown"` because
   Railway can run it internally, where the request never crosses the edge. That
   is why the check must use the public URL, not the healthcheck log. The
   `edgeIp` block never contains an address.

   The once-per-process log line `No trusted client address` is a secondary
   signal only. An earlier guest request can consume it, so its absence is not
   proof the edge is healthy.
4. Smoke test:
   - Open a QR table link and request a quote with a test phone. The review page
     shows the visit state and the final total.
   - Attach the same test phone at the Counter. The bill shows the member and
     the card.
   - Pay a small guest bill. The receipt and Z report must show no reward and no
     visit for a guest.
   - Pay a member bill. The loyalty report must show the visit (or the
     promotion, if one applied).
5. If any smoke test fails, go to **Rollback** immediately.

---

## 5. What to watch for the first two weeks

Check once a day, then weekly if clean.

### 5.1 Security events

All of these are rows in `security_events` with the pilot restaurant's
`restaurantId`. They contain no phone number, name or address.

| `eventType` | Meaning | Action |
|---|---|---|
| `loyalty_rate_limited` | A request was refused by a limit. Deduped per subject and window. | A few are normal. A sustained spike means the restaurant ceiling is too low, or someone is probing. Raise `lookupLimitPerHour` only after checking the other events. |
| `loyalty_enumeration_alert` | Five distinct unknown phone hashes from one address in ten minutes. | Investigate. This is the abuse signal, not a customer error. |
| `loyalty_rate_limit_unavailable` | The limiter database call failed and the request was allowed (fail-open). | Investigate immediately. The counter shares the database with the lookup; a counter outage is a database problem. |
| `loyalty_lookup_miss` | A valid new member lookup. | Normal. It is not an alert. |

Daily query (replace the id):

```sql
SELECT "eventType", COUNT(*) AS events
FROM security_events
WHERE "restaurantId" = '<restaurant-id>'
  AND "createdAt" >= now() - interval '1 day'
GROUP BY "eventType"
ORDER BY events DESC;
```

### 5.2 Customer-facing refusals

A refused QR customer is told: “Please order at the counter — our staff will
help.” The response is a generic 429 with a rounded retry window and no member
signal. Count refusals in the loyalty report and in `loyalty_rate_limited`.

- A handful per day is expected on a shared network.
- A large share of real customers refused is an outage, not a security win.
  Raise the restaurant ceiling or fix the edge address first.

### 5.3 Payments and money

- Every paid batch has a `businessDate`; a null value is only valid for a
  pre-migration row.
- Cash: `cashPayable = round5(projectedTotal)` and
  `roundingAdjustment = cashPayable − totalAmount`, within ±0.02.
- The Z report shows a rounding line. The drawer identity is
  `Σ cashPayable = Σ cashReceived − Σ changeGiven`.
- A reward must appear as exactly one ACTIVE `OrderDiscount` per order and as a
  `LoyaltyVisit`. A promotion must not also count a visit.
- `BILL_CHANGED` and `QUOTE_CHANGED` are normal when a bill changes between
  display and payment. A spike means the Counter or QR is holding a stale bill;
  check client versions.
- `AMOUNT_MISMATCH` means the cashier collected a different total. Nothing was
  charged; reload and re-tender.

### 5.4 Data growth and cleanup

- `rate_limit_counters` rows older than 24 hours are pruned by the cleanup job.
  The job is safe to run repeatedly.
- Members, cards, visits and discounts grow with real usage. Do not delete
  financial rows; anonymise a member instead.
- Check that the nightly backup still succeeds and that the restore test is
  still scheduled.

### 5.5 Permissions

The pilot owner and manager roles should match §18.20.14 A:

- **Owner:** `loyalty:attach`, `loyalty:configure`, `loyalty:report`,
  `promotions:manage`, `members:read`, `members:pii`, `members:export`,
  `members:delete`, `members:consent_withdraw`, `settings:write`.
- **Manager:** the same except `members:export` and `members:delete`.

If a manager can export or delete members, stop and fix the role mapping before
continuing. The seed prerequisite and the exact verification query are in
step 1.5.

---

## 6. Rollback — exact steps

Rollback is a **flag change**, not a database rollback. Do not delete loyalty
rows and do not reverse migrations.

1. In the hosting provider, set `LOYALTY_ENABLED=false` (or remove the variable).
2. Redeploy or restart. Both the QR quote and the Counter take the pre-feature
   path as soon as the new process is live.
3. Optionally disable the restaurant row so a later flag flip does not silently
   re-enable it:
   ```sql
   UPDATE loyalty_settings
   SET enabled = false, "updatedAt" = now()
   WHERE "restaurantId" = '<restaurant-id>';
   ```
4. Verify:
   - a QR quote returns `LOYALTY_DISABLED`;
   - a Counter bill has no member, reward or visit state;
   - a new payment writes no `LoyaltyVisit`, no `LoyaltyCard` change and no
     `OrderDiscount`; its `PaymentBatch.outcome` is `GUEST`;
   - existing loyalty rows and financial history are untouched.
5. Keep the `LOYALTY_PHONE_HMAC_KEY` in place. Removing it makes member paths
   fail closed but does not delete data. Rotating it requires a rehash plan; do
   not rotate it as part of a rollback.
6. Record the time, the reason and the operator in the incident log.

---

## 7. Do not do these

- Do not run `prisma migrate reset` against production. It drops data.
- Do not edit `prisma/migrations/**` to roll back. The migrations are additive;
  the flag is the rollback.
- Do not delete `Customer`, `LoyaltyVisit`, `OrderDiscount`, `Payment` or
  `PaymentBatch` rows to “clean up” a pilot. Anonymise the member instead.
- Do not log or paste a phone number, the HMAC key, or a full member profile.
  Use the masked phone in the owner UI and the keyed `phoneHash` in queries.
- Do not raise `numReplicas` during the pilot without reviewing the cleanup job
  and the rate-limit windows.

---

## 8. Quick reference

| Item | Value |
|---|---|
| Global switch | `LOYALTY_ENABLED=true` (exact) |
| Per-restaurant switch | `LoyaltySettings.enabled = true` |
| Phone key | `LOYALTY_PHONE_HMAC_KEY` (secret, never logged) |
| Default restaurant ceiling | `lookupLimitPerHour = 30` (1–1000) |
| Fixed limits | phone 10/h, session 10/h, IP 120/h, unknown 10/h |
| Rollback | set `LOYALTY_ENABLED=false`, redeploy |
| Do not | delete rows, reverse migrations, log PII |
