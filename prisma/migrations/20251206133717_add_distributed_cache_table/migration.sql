-- CreateTable
CREATE TABLE "cache_entries" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cache_entries_key_key" ON "cache_entries"("key");

-- CreateIndex
CREATE INDEX "cache_entries_expiresAt_idx" ON "cache_entries"("expiresAt");

-- CreateIndex
CREATE INDEX "cache_entries_key_expiresAt_idx" ON "cache_entries"("key", "expiresAt");
