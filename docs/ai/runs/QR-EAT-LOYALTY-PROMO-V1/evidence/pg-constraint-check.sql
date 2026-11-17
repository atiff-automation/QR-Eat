-- Loyalty v1 constraint proof (QR-EAT-LOYALTY-PROMO-V1).
-- Runs inside a transaction that ends in ROLLBACK: no rows persist.
-- Each test raises only if a constraint that must reject DOES NOT.
-- Exit 0 == every constraint behaved as the contract requires.
--
-- Run: npx prisma db execute --file <this file> --schema prisma/schema.prisma

BEGIN;

-- ---------------------------------------------------------------- fixtures
INSERT INTO restaurant_owners (id, email, "passwordHash", "firstName", "lastName", "updatedAt")
VALUES ('00000000-0000-0000-0000-0000000000aa', 'pgcheck@example.invalid',
        'not-a-real-hash', 'PG', 'Check', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO restaurants (id, "ownerId", name, slug, address, "updatedAt")
VALUES
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'PG Check A', 'pg-check-a', 'addr', now()),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', 'PG Check B', 'pg-check-b', 'addr', now()),
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000aa', 'PG Check C', 'pg-check-c', 'addr', now());

INSERT INTO orders (
  id, "orderNumber", "restaurantId",
  "taxRateSnapshot", "serviceChargeRateSnapshot",
  "taxLabelSnapshot", "serviceChargeLabelSnapshot", "updatedAt", "orderType"
) VALUES
  ('22222222-0000-0000-0000-000000000001', 'PGCHK-1', '11111111-0000-0000-0000-000000000001',
   0.06, 0.10, 'SST', 'Service', now(), 'TAKEAWAY'),
  ('22222222-0000-0000-0000-000000000002', 'PGCHK-2', '11111111-0000-0000-0000-000000000001',
   0.06, 0.10, 'SST', 'Service', now(), 'TAKEAWAY');

INSERT INTO customers (id, "restaurantId", "phoneHash", "updatedAt")
VALUES ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
        'hash-a', now());

-- ------------------------------------------------- 1. loyalty_settings bounds
DO $$
BEGIN
  BEGIN
    INSERT INTO loyalty_settings (id, "restaurantId", "rewardValue", "maxDiscount",
                                  "rewardLabel", "updatedAt", "visitsRequired")
    VALUES ('s-t1', '11111111-0000-0000-0000-000000000001', 10, 15, 'x', now(), 11);
    RAISE EXCEPTION 'FAIL: loyalty_settings accepted visitsRequired=11';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO loyalty_settings (id, "restaurantId", "rewardValue", "maxDiscount",
                                  "rewardLabel", "updatedAt", "minDailySpend")
    VALUES ('s-t2', '11111111-0000-0000-0000-000000000002', 10, 15, 'x', now(), 1001);
    RAISE EXCEPTION 'FAIL: loyalty_settings accepted minDailySpend=1001';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO loyalty_settings (id, "restaurantId", "rewardType", "rewardValue",
                                  "maxDiscount", "rewardLabel", "updatedAt")
    VALUES ('s-t3', '11111111-0000-0000-0000-000000000003', 'PERCENT', 150, 15, 'x', now());
    RAISE EXCEPTION 'FAIL: loyalty_settings accepted PERCENT rewardValue=150';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ----------------------------------------------------- 2. promotion window
DO $$
BEGIN
  BEGIN
    INSERT INTO promotions (id, "restaurantId", name, "receiptLabel", type, value,
                            scope, "maxDiscount", "startsAt", "endsAt", "updatedAt")
    VALUES ('p-t1', '11111111-0000-0000-0000-000000000001', 'Bad window', 'BAD',
            'PERCENT', 10, 'ORDER', 15, now(), now() - interval '1 day', now());
    RAISE EXCEPTION 'FAIL: promotions accepted endsAt <= startsAt';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ------------------------------------- 3/4. order_discounts amount + snapshot
DO $$
BEGIN
  BEGIN
    INSERT INTO order_discounts (id, "orderId", "restaurantId", source, "sourceId",
                                 label, "baseAmount", amount, "promotionSnapshot")
    VALUES ('d-t1', '22222222-0000-0000-0000-000000000001',
            '11111111-0000-0000-0000-000000000001', 'PROMOTION', 'p1', 'x',
            10.00, 12.00, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: order_discounts accepted amount > baseAmount';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO order_discounts (id, "orderId", "restaurantId", source, "sourceId",
                                 label, "baseAmount", amount, "rewardSnapshot")
    VALUES ('d-t2', '22222222-0000-0000-0000-000000000002',
            '11111111-0000-0000-0000-000000000001', 'PROMOTION', 'p1', 'x',
            10.00, 5.00, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: order_discounts accepted PROMOTION with only rewardSnapshot';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ------------------------------------------------- 5. loyalty_cards in-cycle
DO $$
BEGIN
  BEGIN
    INSERT INTO loyalty_cards (id, "restaurantId", "customerId", "visitsInCycle",
                               "visitsRequired", "rewardType", "rewardValue",
                               "maxDiscount", "rewardLabel", "minDailySpend")
    VALUES ('c-t1', '11111111-0000-0000-0000-000000000001',
            '33333333-0000-0000-0000-000000000001', 3, 3, 'PERCENT', 10, 15, 'x', 20);
    RAISE EXCEPTION 'FAIL: loyalty_cards accepted visitsInCycle >= visitsRequired';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ------------------------------------------ 6. payment_batches rounding identity
DO $$
BEGIN
  BEGIN
    INSERT INTO payment_batches (id, "idempotencyKey", "requestHash", "restaurantId",
                                 "orderId", "paymentMethod", "totalAmount", "receiptNumber",
                                 response, "updatedAt", "cashPayable", "roundingAdjustment")
    VALUES ('b-t1', 'pgchk-idem-1', 'h', '11111111-0000-0000-0000-000000000001',
            '22222222-0000-0000-0000-000000000001',
            'cash', 55.68, 'PGCHK-R1', '{}'::jsonb, now(), 55.70, 0.00);
    RAISE EXCEPTION 'FAIL: payment_batches accepted roundingAdjustment != cashPayable - totalAmount';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- --------------------------------------- 7. customers ACTIVE partial uniqueness
DO $$
BEGIN
  -- second ACTIVE row with the same (restaurantId, phoneHash) must be rejected
  BEGIN
    INSERT INTO customers (id, "restaurantId", "phoneHash", "updatedAt")
    VALUES ('33333333-0000-0000-0000-000000000002',
            '11111111-0000-0000-0000-000000000001', 'hash-a', now());
    RAISE EXCEPTION 'FAIL: customers accepted a second ACTIVE phoneHash';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- an ANONYMIZED row with the same hash must be allowed (re-enrolment)
  INSERT INTO customers (id, "restaurantId", "phoneHash", status, "anonymizedAt", "updatedAt")
  VALUES ('33333333-0000-0000-0000-000000000003',
          '11111111-0000-0000-0000-000000000001', 'hash-a', 'ANONYMIZED', now(), now());
END $$;

-- -------------------------------- 8. order_discounts one ACTIVE row per order
DO $$
BEGIN
  INSERT INTO order_discounts (id, "orderId", "restaurantId", source, "sourceId",
                               label, "baseAmount", amount, "promotionSnapshot")
  VALUES ('d-ok-1', '22222222-0000-0000-0000-000000000001',
          '11111111-0000-0000-0000-000000000001', 'PROMOTION', 'p1', 'ok',
          10.00, 5.00, '{}'::jsonb);

  BEGIN
    INSERT INTO order_discounts (id, "orderId", "restaurantId", source, "sourceId",
                                 label, "baseAmount", amount, "promotionSnapshot")
    VALUES ('d-ok-2', '22222222-0000-0000-0000-000000000001',
            '11111111-0000-0000-0000-000000000001', 'PROMOTION', 'p2', 'dup',
            10.00, 4.00, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: order_discounts accepted a second ACTIVE row for one order';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- ----------------------------------- 9. PaymentBatch.businessDate round-trip
DO $$
DECLARE
  stored date;
BEGIN
  INSERT INTO payment_batches (id, "idempotencyKey", "requestHash", "restaurantId",
                               "orderId", "paymentMethod", "totalAmount", "receiptNumber",
                               response, "updatedAt", "businessDate")
  VALUES ('b-t2', 'pgchk-idem-2', 'h', '11111111-0000-0000-0000-000000000001',
          '22222222-0000-0000-0000-000000000002',
          'cash', 10.00, 'PGCHK-R2', '{}'::jsonb, now(), DATE '2026-11-13');

  SELECT "businessDate" INTO stored FROM payment_batches WHERE id = 'b-t2';
  IF stored IS DISTINCT FROM DATE '2026-11-13' THEN
    RAISE EXCEPTION 'FAIL: businessDate round-trip mismatch (got %)', stored;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM payment_batches
    WHERE id = 'b-t2'
      AND "businessDate" = (TIMESTAMP '2026-11-13 00:00:00+00' AT TIME ZONE 'UTC')::date
  ) THEN
    RAISE EXCEPTION 'FAIL: businessDate does not compare equal to the UTC-midnight date';
  END IF;
END $$;

-- ------------------------------------------ 10. rate_limit_counters scope CHECK
DO $$
BEGIN
  BEGIN
    INSERT INTO rate_limit_counters (id, "restaurantId", scope, subject, "windowStart")
    VALUES ('rl-t1', '11111111-0000-0000-0000-000000000001', 'BOGUS', 'x', now());
    RAISE EXCEPTION 'FAIL: rate_limit_counters accepted scope=BOGUS';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO rate_limit_counters (id, "restaurantId", scope, subject, "windowStart")
  VALUES ('rl-ok', '11111111-0000-0000-0000-000000000001', 'PHONE_HASH', 'hash-a', now());
END $$;

ROLLBACK;
