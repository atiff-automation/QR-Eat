-- CreateTable
CREATE TABLE "pending_events" (
    "id" TEXT NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "eventData" JSONB NOT NULL,
    "restaurantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "pending_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_restaurant_pending" ON "pending_events"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_cleanup" ON "pending_events"("createdAt");
