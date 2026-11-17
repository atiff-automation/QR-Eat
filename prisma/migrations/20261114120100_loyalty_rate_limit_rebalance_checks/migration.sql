-- Loyalty rate-limit rebalance — database invariants Prisma cannot express
-- (P7c). The service validates the same 1–1000 bound before writing, so this
-- CHECK can never fire from a normal request; it protects the data from a
-- direct write.
--
-- Additive only: the constraint is added with NOT VALID so it applies to new
-- and updated rows without scanning or rewriting existing rows, then validated
-- in place. Every existing row already satisfies it because the column was
-- added with DEFAULT 30.

ALTER TABLE "loyalty_settings"
  ADD CONSTRAINT "loyalty_settings_lookupLimitPerHour_check"
    CHECK ("lookupLimitPerHour" >= 1 AND "lookupLimitPerHour" <= 1000) NOT VALID;

ALTER TABLE "loyalty_settings"
  VALIDATE CONSTRAINT "loyalty_settings_lookupLimitPerHour_check";
