-- Fix order_modifications foreign key constraint
-- Make modifiedBy nullable and drop the foreign key constraint

-- Step 1: Drop the foreign key constraint
ALTER TABLE "order_modifications" 
DROP CONSTRAINT IF EXISTS "order_modifications_modifiedBy_fkey";

-- Step 2: Make the column nullable
ALTER TABLE "order_modifications" 
ALTER COLUMN "modifiedBy" DROP NOT NULL;

-- Step 3: Add back the foreign key constraint as optional
ALTER TABLE "order_modifications"
ADD CONSTRAINT "order_modifications_modifiedBy_fkey" 
FOREIGN KEY ("modifiedBy") REFERENCES "staff"("id") 
ON DELETE SET NULL;
