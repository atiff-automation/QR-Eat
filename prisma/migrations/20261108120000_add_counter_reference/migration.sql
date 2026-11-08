-- Stable Counter reference for orders created while offline.
-- Example: OFF-261108-022. Online-created orders leave this NULL.
ALTER TABLE "orders" ADD COLUMN "counterReference" TEXT;
