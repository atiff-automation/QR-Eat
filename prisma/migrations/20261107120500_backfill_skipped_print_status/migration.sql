-- KDS-only acknowledgements were previously stored as FAILED with this exact
-- reason. Reclassify them now that SKIPPED exists; real printer failures keep
-- their own error text and stay FAILED.
UPDATE "order_events"
SET "printStatus" = 'SKIPPED'
WHERE "printStatus" = 'FAILED'
  AND "printError" = 'KDS only — not printed';
