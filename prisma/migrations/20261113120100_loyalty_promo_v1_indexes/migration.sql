-- Loyalty, rewards and promotions v1 — database invariants Prisma cannot
-- express (§18.20.2, §18.20.11, §18.20.14 J, §18.20.15 B/D).
--
-- Plain CREATE INDEX (no CONCURRENTLY): the tables are new and empty, and
-- CONCURRENTLY is illegal inside Prisma's migration transaction (decision Q4).

-- An ACTIVE member is unique per restaurant by phone hash. ANONYMIZED rows keep
-- their phoneHash but are excluded, so the same phone can re-enrol later.
CREATE UNIQUE INDEX "customers_restaurantId_phoneHash_active_key"
  ON "customers" ("restaurantId", "phoneHash")
  WHERE "status" = 'ACTIVE';

-- One ACTIVE discount per order. REPLACED/REMOVED rows are history only.
CREATE UNIQUE INDEX "order_discounts_orderId_active_key"
  ON "order_discounts" ("orderId")
  WHERE "status" = 'ACTIVE';

-- The only four durable rate-limit buckets of §18.20.15 B: per phone hash, per
-- restaurant, per QR session and per trusted edge IP. A typo cannot create a
-- fifth bucket, and because the unique key is tenant-qualified
-- (restaurantId, scope, subject, windowStart) a phone-hash bucket is never
-- shared across restaurants.
ALTER TABLE "rate_limit_counters"
  ADD CONSTRAINT "rate_limit_counters_scope_check"
    CHECK ("scope" IN ('PHONE_HASH', 'RESTAURANT', 'QR_SESSION', 'EDGE_IP'));

-- LoyaltySettings: the rule bounds from §18.20.14 J.
ALTER TABLE "loyalty_settings"
  ADD CONSTRAINT "loyalty_settings_visitsRequired_check"
    CHECK ("visitsRequired" >= 2 AND "visitsRequired" <= 10),
  ADD CONSTRAINT "loyalty_settings_minDailySpend_check"
    CHECK ("minDailySpend" >= 0 AND "minDailySpend" <= 1000),
  ADD CONSTRAINT "loyalty_settings_maxDiscount_check"
    CHECK ("maxDiscount" >= 0),
  ADD CONSTRAINT "loyalty_settings_rewardValue_check"
    CHECK (
      ("rewardType" = 'PERCENT' AND "rewardValue" >= 0 AND "rewardValue" <= 100)
      OR
      ("rewardType" = 'FIXED' AND "rewardValue" > 0)
    );

-- LoyaltyCard snapshots the same rule, so it carries the same bounds plus the
-- in-cycle invariant. The card is always mutated with a single UPDATE, so an
-- intermediate value can never violate this.
ALTER TABLE "loyalty_cards"
  ADD CONSTRAINT "loyalty_cards_visitsInCycle_check"
    CHECK ("visitsInCycle" >= 0 AND "visitsInCycle" < "visitsRequired"),
  ADD CONSTRAINT "loyalty_cards_visitsRequired_check"
    CHECK ("visitsRequired" >= 2 AND "visitsRequired" <= 10),
  ADD CONSTRAINT "loyalty_cards_minDailySpend_check"
    CHECK ("minDailySpend" >= 0 AND "minDailySpend" <= 1000),
  ADD CONSTRAINT "loyalty_cards_maxDiscount_check"
    CHECK ("maxDiscount" >= 0),
  ADD CONSTRAINT "loyalty_cards_rewardValue_check"
    CHECK (
      ("rewardType" = 'PERCENT' AND "rewardValue" >= 0 AND "rewardValue" <= 100)
      OR
      ("rewardType" = 'FIXED' AND "rewardValue" > 0)
    );

-- Promotion bounds from §18.20.14 J.
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_endsAt_check"
    CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "promotions_maxDiscount_check"
    CHECK ("maxDiscount" >= 0),
  ADD CONSTRAINT "promotions_value_check"
    CHECK (
      ("type" = 'PERCENT' AND "value" >= 0 AND "value" <= 100)
      OR
      ("type" = 'FIXED' AND "value" > 0)
    );

-- The discount ledger cannot exceed its eligible base, and exactly one of the
-- two snapshots is present, matching the source.
ALTER TABLE "order_discounts"
  ADD CONSTRAINT "order_discounts_amount_check"
    CHECK ("baseAmount" >= 0 AND "amount" >= 0 AND "amount" <= "baseAmount"),
  ADD CONSTRAINT "order_discounts_snapshot_check"
    CHECK (
      (
        "source" = 'PROMOTION'
        AND "promotionSnapshot" IS NOT NULL
        AND "rewardSnapshot" IS NULL
      )
      OR
      (
        "source" = 'LOYALTY_REWARD'
        AND "promotionSnapshot" IS NULL
        AND "rewardSnapshot" IS NOT NULL
      )
    );

-- Cash rounding is a bill-level adjustment of at most five sen that must
-- reconcile exactly: roundingAdjustment = cashPayable - totalAmount.
-- Card/e-wallet batches have no cashPayable and store null or 0.00 as the
-- adjustment. totalAmount is always the exact order total.
-- Passing: (55.70, 55.68, 0.02), (null, 55.68, null) and (null, 55.68, 0.00).
-- Rejected: (55.70, 55.68, 0.00) and (55.70, 55.68, 0.03).
ALTER TABLE "payment_batches"
  ADD CONSTRAINT "payment_batches_roundingAdjustment_check"
    CHECK (
      (
        "cashPayable" IS NULL
        AND ("roundingAdjustment" IS NULL OR "roundingAdjustment" = 0)
      )
      OR (
        "cashPayable" IS NOT NULL
        AND "roundingAdjustment" IS NOT NULL
        AND "roundingAdjustment" = "cashPayable" - "totalAmount"
        AND "roundingAdjustment" >= -0.02
        AND "roundingAdjustment" <= 0.02
      )
    );
